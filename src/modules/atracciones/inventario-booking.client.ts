import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { join } from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export interface StockUpdateMessage {
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  timestamp: number;
  slot_id: string;
}

export interface StockUpdateAck {
  success: boolean;
  message: string;
  processed_at: number;
  error_code: string;
  current_available: number;
}

const PROTO_PATH = join(__dirname, "..", "..", "proto", "inventory.proto");
const DEADLINE_MS = 3000;

// Cliente de InventoryStockService.PushStockUpdate (Booking :50051).
// Sin BOOKING_HUB_GRPC_HOST queda deshabilitado y no hace nada.
@Injectable()
export class InventarioBookingClient implements OnModuleDestroy {
  private readonly logger = new Logger(InventarioBookingClient.name);
  private readonly client: grpc.Client | null = null;
  readonly serviceId: string;
  private ultimoTimestamp = 0;

  constructor(config: ConfigService) {
    this.serviceId = config.get<string>("PARTNER_SERVICE_ID", "NODE_ATR_ARIEL");
    const host = config.get<string>("BOOKING_HUB_GRPC_HOST");
    if (!host) {
      this.logger.warn(
        "BOOKING_HUB_GRPC_HOST no definido: no se enviará stock a Booking.",
      );
      return;
    }
    const port = config.get<string>("BOOKING_HUB_GRPC_PORT", "50051");
    const tls = config.get<string>("BOOKING_HUB_GRPC_TLS") === "true";

    const definition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: Number,
      defaults: true,
    });
    const proto = grpc.loadPackageDefinition(definition) as any;
    this.client = new proto.inventory.InventoryStockService(
      `${host}:${port}`,
      tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
    );
    this.logger.log(`Stock gRPC hacia ${host}:${port} (${this.serviceId})`);
  }

  get habilitado(): boolean {
    return this.client !== null;
  }

  // Booking descarta timestamps menores o iguales al último por turno: se toma
  // antes de leer el aforo y nunca se repite dentro del proceso.
  siguienteTimestamp(): number {
    this.ultimoTimestamp = Math.max(Date.now(), this.ultimoTimestamp + 1);
    return this.ultimoTimestamp;
  }

  pushStockUpdate(msg: StockUpdateMessage): Promise<StockUpdateAck> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error("Cliente gRPC deshabilitado"));
      (this.client as any).PushStockUpdate(
        msg,
        { deadline: Date.now() + DEADLINE_MS },
        (err: grpc.ServiceError | null, ack: StockUpdateAck) =>
          err ? reject(err) : resolve(ack),
      );
    });
  }

  onModuleDestroy() {
    this.client?.close();
  }
}
