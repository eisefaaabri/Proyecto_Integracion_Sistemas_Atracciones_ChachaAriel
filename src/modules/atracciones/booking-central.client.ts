import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { evento } from "../../common/logging/evento";

export interface CheckinBookingCentral {
  external_order_id: string;
  client_id: string | null;
  estado: "CONFIRMADO_ASISTIDO";
  asistentes_reales: number;
  admin_id: string;
  fecha_checkin: string;
  observaciones: string;
}

export type EstadoNotificacion =
  "NOTIFICADO" | "REINTENTANDO" | "RECHAZADO" | "NO_CONFIGURADO";

export interface ResultadoNotificacion {
  estado: EstadoNotificacion;
  http_status?: number;
}

const TIMEOUT_MS = 6000;
// Reintentos en segundo plano si Booking no responde o falla con 5xx/408/429.
const REINTENTOS_MS = [10_000, 60_000, 300_000];

/**
 * Avisa a Booking Central que el turista asistió (contrato v3.1):
 * POST {BOOKING_CENTRAL_URL}/reservas/{external_order_id}/checkin con X-API-Key.
 */
@Injectable()
export class BookingCentralClient {
  private readonly logger = new Logger(BookingCentralClient.name);
  private readonly baseUrl: string | null;
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    const base = config.get<string>("BOOKING_CENTRAL_URL");
    this.baseUrl = base ? base.replace(/\/+$/, "") : null;
    this.apiKey =
      config.get<string>("BOOKING_CENTRAL_API_KEY") ||
      config.get<string>("BOOKING_API_KEY") ||
      undefined;
    if (!this.baseUrl)
      this.logger.warn(
        "Sin BOOKING_CENTRAL_URL: los check-in no se notificarán a Booking.",
      );
  }

  async notificarCheckin(
    datos: CheckinBookingCentral,
    correlationId?: string,
  ): Promise<ResultadoNotificacion> {
    if (!this.baseUrl) return { estado: "NO_CONFIGURADO" };
    const resultado = await this.enviar(datos, correlationId, 1);
    if (resultado.estado === "REINTENTANDO")
      this.reintentar(datos, correlationId, 0);
    return resultado;
  }

  private reintentar(
    datos: CheckinBookingCentral,
    correlationId: string | undefined,
    i: number,
  ) {
    if (i >= REINTENTOS_MS.length) {
      this.log("warn", "booking.checkin.abandonado", correlationId, datos);
      return;
    }
    setTimeout(async () => {
      const r = await this.enviar(datos, correlationId, i + 2);
      if (r.estado === "REINTENTANDO")
        this.reintentar(datos, correlationId, i + 1);
    }, REINTENTOS_MS[i]).unref();
  }

  private async enviar(
    datos: CheckinBookingCentral,
    correlationId: string | undefined,
    intento: number,
  ): Promise<ResultadoNotificacion> {
    const url = `${this.baseUrl}/reservas/${encodeURIComponent(datos.external_order_id)}/checkin`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { "X-API-Key": this.apiKey }),
          ...(correlationId && { "X-Correlation-Id": correlationId }),
        },
        body: JSON.stringify(datos),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        this.log("log", "booking.checkin.notificado", correlationId, datos, {
          intento,
          http_status: res.status,
        });
        return { estado: "NOTIFICADO", http_status: res.status };
      }
      const transitorio = res.status >= 500 || [408, 429].includes(res.status);
      this.log("warn", "booking.checkin.fallido", correlationId, datos, {
        intento,
        http_status: res.status,
        detalle: (await res.text().catch(() => "")).slice(0, 300),
      });
      return {
        estado: transitorio ? "REINTENTANDO" : "RECHAZADO",
        http_status: res.status,
      };
    } catch (err) {
      this.log("warn", "booking.checkin.fallido", correlationId, datos, {
        intento,
        error: err?.message,
      });
      return { estado: "REINTENTANDO" };
    }
  }

  private log(
    nivel: "log" | "warn",
    event: string,
    correlationId: string | undefined,
    datos: CheckinBookingCentral,
    extra: object = {},
  ) {
    this.logger[nivel](
      evento(event, {
        correlation_id: correlationId,
        external_order_id: datos.external_order_id,
        url: `${this.baseUrl}/reservas/${datos.external_order_id}/checkin`,
        ...extra,
      }),
    );
  }
}
