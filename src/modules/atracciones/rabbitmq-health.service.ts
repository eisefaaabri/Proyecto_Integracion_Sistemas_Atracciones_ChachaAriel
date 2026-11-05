import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect } from "amqplib";
import { evento } from "../../common/logging/evento";

export type EstadoRabbit = "UP" | "DOWN" | "NOT_CONFIGURED";

const TIMEOUT_MS = 3000;
// Abrir una conexión AMQP en cada health check sería caro: se reutiliza 30 s.
const CACHE_MS = 30_000;

@Injectable()
export class RabbitMqHealthService {
  private readonly logger = new Logger(RabbitMqHealthService.name);
  private readonly url: string | undefined;
  private ultimo: { estado: EstadoRabbit; en: number } | null = null;

  constructor(config: ConfigService) {
    this.url = config.get<string>("RABBITMQ_URL") || undefined;
  }

  async estado(): Promise<EstadoRabbit> {
    if (!this.url) return "NOT_CONFIGURED";
    if (this.ultimo && Date.now() - this.ultimo.en < CACHE_MS)
      return this.ultimo.estado;
    let estado: EstadoRabbit = "DOWN";
    try {
      const conexion = await connect(this.url, { timeout: TIMEOUT_MS });
      await conexion.close();
      estado = "UP";
    } catch (err) {
      this.logger.warn(
        evento("rabbitmq.health.fallido", {
          error: err?.message || err?.code || String(err),
        }),
      );
    }
    if (this.ultimo?.estado !== estado)
      this.logger.log(evento("rabbitmq.health.estado", { estado }));
    this.ultimo = { estado, en: Date.now() };
    return estado;
  }
}
