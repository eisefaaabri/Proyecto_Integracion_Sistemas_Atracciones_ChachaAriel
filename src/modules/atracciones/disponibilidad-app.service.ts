import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CatalogService } from "../catalog/catalog.service";
import { Atraccion, EstadoAtraccion } from "../catalog/catalog.entities";
import { InventoryService } from "../inventory/inventory.service";
import { PricingService } from "../pricing/pricing.service";
import { TipoTarifa } from "../pricing/pricing.entities";
import { InventarioBookingClient } from "./inventario-booking.client";
import { DisponibilidadQueryDto } from "./dto/booking-reserva.dto";
import {
  UUID_REGEX,
  horaActualEcuador,
  horaLegible,
  hoyEcuador,
  problem,
  slotId,
  sumarDias,
} from "./booking.utils";

const UMBRAL_ULTIMOS_CUPOS = 3;

function atraccionNoEncontrada(id: string) {
  return problem(
    HttpStatus.NOT_FOUND,
    "ATTRACTION_NOT_FOUND",
    "atraccion-no-encontrada",
    "Atracción no encontrada",
    `No existe la atracción '${id}'.`,
  );
}

/**
 * Cupos por turno (Inventory) con precios vigentes (Pricing) y su envío a Booking.
 * Cada turno tiene su propio cupo: reservar en uno no descuenta en los demás.
 */
@Injectable()
export class DisponibilidadAppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DisponibilidadAppService.name);
  private readonly diasSincronizacion: number;
  // Envíos de stock en curso por "atracción|fecha" (ver notificarStock).
  private readonly enviosStock = new Map<
    string,
    { pendiente: boolean; resultado: Promise<boolean> }
  >();

  constructor(
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly cliente: InventarioBookingClient,
    config: ConfigService,
  ) {
    this.diasSincronizacion = Number(
      config.get<string>("BOOKING_GRPC_SYNC_DIAS", "7"),
    );
  }

  async atraccionPorUuid(id: string): Promise<Atraccion> {
    const atr = UUID_REGEX.test(id) ? await this.catalog.findByUuid(id) : null;
    if (!atr) throw atraccionNoEncontrada(id);
    return atr;
  }

  async consultarDisponibilidad(id: string, query: DisponibilidadQueryDto) {
    const fecha = query.date ?? query.fecha;
    if (!fecha) {
      throw problem(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_FAILED",
        "validacion",
        "Solicitud inválida",
        "El parámetro date (YYYY-MM-DD) es obligatorio.",
        { invalid_params: [{ name: "date", reason: "Es obligatorio." }] },
      );
    }
    const atr = await this.atraccionPorUuid(id);
    return this.turnosDelDia(atr, fecha);
  }

  async turnosDelDia(atr: Atraccion, fecha: string) {
    const hoy = hoyEcuador();
    const ahora = horaActualEcuador();
    const vendible =
      atr.atr_estado === EstadoAtraccion.PUBLICADA && fecha >= hoy;
    const [cupos, precios] = await Promise.all([
      this.inventory.cuposDelDia(atr.atr_id, fecha),
      this.pricing.vigentes([atr.atr_id], fecha),
    ]);
    const p = precios.get(atr.atr_id);
    const precioAdulto = p?.[TipoTarifa.ADULTO] ?? 0;
    const precioNino = p?.[TipoTarifa.NINO] ?? 0;

    const turnos = cupos.map((c) => {
      const yaInicio = fecha === hoy && c.hora <= ahora;
      const disponibles =
        vendible && !yaInicio && !c.cerrada
          ? Math.max(c.total - c.reservado, 0)
          : 0;
      const estado =
        disponibles === 0
          ? "AGOTADO"
          : disponibles <= UMBRAL_ULTIMOS_CUPOS
            ? "ULTIMOS_CUPOS"
            : "DISPONIBLE";
      const legible = horaLegible(c.hora);
      return {
        slot_id: slotId(fecha, c.hora),
        time: legible,
        time_24h: `${c.hora}:00`,
        total_slots: c.total,
        available_slots: disponibles,
        status: estado,
        price_adult: precioAdulto,
        price_child: precioNino,
        hora: legible,
        hora_24h: `${c.hora}:00`,
        cupos_totales: c.total,
        cupos_disponibles: disponibles,
        estado,
        precio_adulto_slot: precioAdulto,
        precio_nino_slot: precioNino,
      };
    });
    // Cupos independientes por turno: el total del día es la suma.
    const total = turnos.reduce((s, t) => s + t.available_slots, 0);
    return {
      atraccion_id: atr.atr_uuid,
      date: fecha,
      fecha,
      total_available_slots: total,
      total_cupos_disponibles: total,
      time_slots: turnos,
      turnos,
    };
  }

  onApplicationBootstrap() {
    if (this.cliente.habilitado && this.diasSincronizacion > 0) {
      void this.sincronizarCatalogo();
    }
  }

  // Empuja a Booking los cupos de cada turno de esa fecha. Nunca lanza: devuelve
  // false si Booking no respondió, para que la sincronización masiva se detenga.
  // Un solo envío a la vez por atracción y fecha: si llega otro cambio mientras
  // tanto, se repite al terminar con el aforo recién leído. El REST de Booking no
  // lleva timestamp, así que esto evita que un valor viejo pise a uno nuevo.
  notificarStock(
    atrUuid: string,
    fecha: string,
    correlationId?: string,
  ): Promise<boolean> {
    if (!this.cliente.habilitado) return Promise.resolve(true);
    const clave = `${atrUuid}|${fecha}`;
    const enCurso = this.enviosStock.get(clave);
    if (enCurso) {
      enCurso.pendiente = true;
      return enCurso.resultado;
    }
    const envio = { pendiente: false, resultado: null as Promise<boolean> };
    envio.resultado = (async () => {
      let ok = true;
      try {
        do {
          envio.pendiente = false;
          ok = await this.enviarStock(atrUuid, fecha, correlationId);
        } while (envio.pendiente);
      } finally {
        this.enviosStock.delete(clave);
      }
      return ok;
    })();
    this.enviosStock.set(clave, envio);
    return envio.resultado;
  }

  private async enviarStock(
    atrUuid: string,
    fecha: string,
    correlationId?: string,
  ): Promise<boolean> {
    const timestamp = this.cliente.siguienteTimestamp();
    try {
      const disponibilidad = await this.consultarDisponibilidad(atrUuid, {
        date: fecha,
      });
      const acks = await Promise.all(
        disponibilidad.time_slots.map((turno) =>
          this.cliente.enviarStock({
            service_id: this.cliente.serviceId,
            item_id: atrUuid,
            date: fecha,
            time_slot: turno.time_24h.slice(0, 5),
            available_units: turno.available_slots,
            timestamp,
            slot_id: turno.slot_id,
          }),
        ),
      );
      this.log("inventario.booking.push", correlationId, {
        canal: this.cliente.canal,
        attraction_id: atrUuid,
        date: fecha,
        slots: disponibilidad.time_slots.map((t, i) => ({
          slot_id: t.slot_id,
          available_units: t.available_slots,
          ack: acks[i]?.error_code || (acks[i]?.success ? "OK" : "ERROR"),
        })),
      });
      return true;
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: "inventario.booking.push_fallido",
          canal: this.cliente.canal,
          correlation_id: correlationId,
          attraction_id: atrUuid,
          date: fecha,
          code: err?.code,
          error: err?.message,
        }),
      );
      return false;
    }
  }

  // Ventana de días hacia adelante: tras crear o editar la atracción (cambia el aforo).
  async sincronizarAtraccion(atrUuid: string): Promise<boolean> {
    if (!this.cliente.habilitado) return true;
    const hoy = hoyEcuador();
    for (let i = 0; i < this.diasSincronizacion; i++) {
      if (!(await this.notificarStock(atrUuid, sumarDias(hoy, i))))
        return false;
    }
    return true;
  }

  private async sincronizarCatalogo() {
    const atracciones = await this.catalog.listarPublicadasIds();
    for (const { atr_uuid } of atracciones) {
      if (!(await this.sincronizarAtraccion(atr_uuid))) {
        this.logger.warn(
          "Sincronización inicial de stock con Booking interrumpida: Booking no responde.",
        );
        return;
      }
    }
    this.logger.log(
      `Stock inicial enviado a Booking: ${atracciones.length} atracciones x ${this.diasSincronizacion} días.`,
    );
  }

  private log(event: string, correlationId: string | undefined, data: object) {
    this.logger.log(
      JSON.stringify({ event, correlation_id: correlationId, ...data }),
    );
  }
}
