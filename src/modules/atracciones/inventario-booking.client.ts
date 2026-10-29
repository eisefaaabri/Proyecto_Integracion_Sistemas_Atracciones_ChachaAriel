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
  message?: string;
  error_code?: string;
  current_available?: number;
}

type Canal = "grpc" | "rest";

const PROTO_PATH = join(__dirname, "..", "..", "proto", "inventory.proto");
const DEADLINE_MS = 5000;

// Envía el stock a Booking por gRPC (PushStockUpdate) o por REST
// (POST {BOOKING_HUB_REST_URL}/inventory/stock). Sin destino configurado no hace nada.
@Injectable()
export class InventarioBookingClient implements OnModuleDestroy {
  private readonly logger = new Logger(InventarioBookingClient.name);
  readonly serviceId: string;
  readonly canal: Canal | null = null;
  private readonly apiKey: string | undefined;
  private readonly grpcClient: grpc.Client | null = null;
  private readonly restUrl: string | null = null;
  private ultimoTimestamp = 0;

  constructor(config: ConfigService) {
    this.serviceId = config.get<string>("PARTNER_SERVICE_ID", "NODE_ATR_ARIEL");
    // Booking usa la misma clave en ambos sentidos salvo que se configure otra.
    this.apiKey =
      config.get<string>("BOOKING_STOCK_API_KEY") ||
      config.get<string>("BOOKING_API_KEY") ||
      undefined;

    const restBase = config.get<string>("BOOKING_HUB_REST_URL");
    const grpcHost = config.get<string>("BOOKING_HUB_GRPC_HOST");
    const preferido = config.get<string>("BOOKING_STOCK_TRANSPORT");
    const canal: Canal | null =
      preferido === "rest" || preferido === "grpc"
        ? preferido
        : restBase
          ? "rest"
          : grpcHost
            ? "grpc"
            : null;

    if (canal === "rest" && restBase) {
      this.restUrl = `${restBase.replace(/\/+$/, "")}/inventory/stock`;
      this.canal = "rest";
      this.logger.log(
        `Stock por REST hacia ${this.restUrl} (${this.serviceId})`,
      );
    } else if (canal === "grpc" && grpcHost) {
      const port = config.get<string>("BOOKING_HUB_GRPC_PORT", "50051");
      const tls = config.get<string>("BOOKING_HUB_GRPC_TLS") === "true";
      const definition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: Number,
        defaults: true,
      });
      const proto = grpc.loadPackageDefinition(definition) as any;
      this.grpcClient = new proto.inventory.InventoryStockService(
        `${grpcHost}:${port}`,
        tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
      );
      this.canal = "grpc";
      this.logger.log(
        `Stock por gRPC hacia ${grpcHost}:${port} (${this.serviceId})`,
      );
    } else {
      this.logger.warn(
        "Sin BOOKING_HUB_REST_URL ni BOOKING_HUB_GRPC_HOST: no se enviará stock a Booking.",
      );
      return;
    }
    if (!this.apiKey) {
      this.logger.warn(
        "Sin clave para Booking: el stock se envía sin x-api-key.",
      );
    }
  }

  get habilitado(): boolean {
    return this.canal !== null;
  }

  // Booking (gRPC) descarta timestamps menores o iguales al último por turno: se
  // toma antes de leer el aforo y nunca se repite dentro del proceso.
  siguienteTimestamp(): number {
    this.ultimoTimestamp = Math.max(Date.now(), this.ultimoTimestamp + 1);
    return this.ultimoTimestamp;
  }

  enviarStock(msg: StockUpdateMessage): Promise<StockUpdateAck> {
    if (this.canal === "rest") return this.enviarRest(msg);
    if (this.canal === "grpc") return this.enviarGrpc(msg);
    return Promise.reject(new Error("Envío de stock deshabilitado"));
  }

  private enviarGrpc(msg: StockUpdateMessage): Promise<StockUpdateAck> {
    const metadata = new grpc.Metadata();
    if (this.apiKey) metadata.set("x-api-key", this.apiKey);
    return new Promise((resolve, reject) => {
      (this.grpcClient as any).PushStockUpdate(
        msg,
        metadata,
        { deadline: Date.now() + DEADLINE_MS },
        (err: grpc.ServiceError | null, ack: StockUpdateAck) =>
          err ? reject(err) : resolve(ack),
      );
    });
  }

  // El endpoint REST de Booking documenta solo estos campos.
  private async enviarRest(msg: StockUpdateMessage): Promise<StockUpdateAck> {
    const res = await fetch(this.restUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { "x-api-key": this.apiKey }),
      },
      body: JSON.stringify({
        service_id: msg.service_id,
        item_id: msg.item_id,
        date: msg.date,
        time_slot: msg.time_slot,
        available_units: msg.available_units,
      }),
      signal: AbortSignal.timeout(DEADLINE_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(
        `HTTP ${res.status}: ${body?.message ?? res.statusText}`,
      ) as Error & { code?: number };
      error.code = res.status;
      throw error;
    }
    return {
      success: body?.success !== false,
      message: body?.message,
      error_code:
        body?.error_code ?? (body?.success === false ? "ERROR" : "OK"),
      current_available: body?.available_units,
    };
  }

  onModuleDestroy() {
    this.grpcClient?.close();
  }
}
