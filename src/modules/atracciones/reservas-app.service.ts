import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { EntityManager } from "typeorm";
import { Atraccion } from "../catalog/catalog.entities";
import { CatalogService } from "../catalog/catalog.service";
import {
  PricingService,
  FACTOR_TARIFA,
  round2,
} from "../pricing/pricing.service";
import { TipoTarifa } from "../pricing/pricing.entities";
import {
  InventoryService,
  UbicacionTurno,
} from "../inventory/inventory.service";
import { OrderService } from "../order/order.service";
import {
  CanalOrden,
  CodigoEstadoOrden,
  Orden,
  OrdenDetalle,
} from "../order/order.entities";
import {
  BookingService,
  generarCodigoReserva,
} from "../booking/booking.service";
import {
  CodigoEstadoReserva,
  Reserva,
  TipoEventoOutbox,
} from "../booking/booking.entities";
import { PaymentService } from "../payment/payment.service";
import { CodigoMetodoPago, Pago } from "../payment/payment.entities";
import { RefundService } from "../refund/refund.service";
import { Reembolso } from "../refund/refund.entities";
import { Comprador, InvoicingService } from "../invoicing/invoicing.service";
import { CodigoEstadoFactura } from "../invoicing/invoicing.entities";
import { currentCorrelationId } from "../../common/middleware/correlation-id.middleware";
import { slotId } from "./booking.utils";

export interface Pasajeros {
  adultos: number;
  ninos: number;
  seniors: number;
  infantes: number;
}

export interface PagoRecibido {
  metodo: CodigoMetodoPago;
  referencia: string | null;
  comprobanteUrl?: string | null;
  // Valor que envió el cliente (CREDIT_CARD, PAYPAL…), para los eventos.
  metodoApi?: string;
}

export interface NuevaReservaApp {
  atraccion: Atraccion;
  fecha: string;
  horId: number;
  pasajeros: Pasajeros;
  canal: CanalOrden;
  usuId: number | null;
  titular: { nombre: string; documento?: string | null };
  contacto: { correo: string | null; telefono: string | null };
  comprador: Comprador;
  pago?: PagoRecibido;
  referenciaExterna?: string | null;
  observaciones?: string | null;
}

export interface VistaReserva {
  reserva: Reserva;
  estado: CodigoEstadoReserva;
  orden: Orden;
  turno: UbicacionTurno;
  atraccion: Atraccion;
  pago: Pago | null;
  reembolso: Reembolso | null;
}

export class SinCupoError extends Error {
  constructor(
    readonly disponibles: number,
    readonly total: number,
  ) {
    super("SIN_CUPO");
  }
}

export class ReservaUsadaError extends Error {
  constructor() {
    super("RESERVA_CON_CHECKIN");
  }
}

const TIPOS: [keyof Pasajeros, TipoTarifa][] = [
  ["adultos", TipoTarifa.ADULTO],
  ["ninos", TipoTarifa.NINO],
  ["seniors", TipoTarifa.MAYOR],
  ["infantes", TipoTarifa.INFANTE],
];

const STATUS_EVENTO: Record<CodigoEstadoReserva, string> = {
  PENDIENTE_PAGO: "PENDING",
  CONFIRMADA: "CONFIRMED",
  CHECKED_IN: "CHECKED_IN",
  CANCELADA: "CANCELLED",
  COMPLETADA: "COMPLETED",
};

/**
 * Orquesta una reserva a través de los servicios (Order, Booking, Inventory, Pricing,
 * Payment, Refund, Invoicing). Todo ocurre en la transacción del llamador: si algo falla,
 * nada queda a medias, y los eventos salen por el outbox en esa misma transacción.
 */
@Injectable()
export class ReservasAppService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly orders: OrderService,
    private readonly bookings: BookingService,
    private readonly payments: PaymentService,
    private readonly refunds: RefundService,
    private readonly invoicing: InvoicingService,
  ) {}

  async crear(
    d: NuevaReservaApp,
    manager: EntityManager,
  ): Promise<VistaReserva> {
    const atr = d.atraccion;
    const precios = (
      await this.pricing.vigentes([atr.atr_id], d.fecha, manager)
    ).get(atr.atr_id);
    const adulto = precios?.[TipoTarifa.ADULTO] ?? 0;
    const lineas = TIPOS.filter(([campo]) => d.pasajeros[campo] > 0).map(
      ([campo, tipo]) => {
        const precio = precios?.[tipo] ?? round2(adulto * FACTOR_TARIFA[tipo]);
        const cantidad = d.pasajeros[campo];
        return {
          atrId: atr.atr_id,
          tipo,
          descripcion: atr.atr_nombre,
          cantidad,
          precio,
          subtotal: round2(precio * cantidad),
        };
      },
    );
    const total = round2(lineas.reduce((s, l) => s + l.subtotal, 0));
    const tickets =
      d.pasajeros.adultos +
      d.pasajeros.ninos +
      d.pasajeros.seniors +
      d.pasajeros.infantes;

    const disId = await this.inventory.reservar(
      atr.atr_id,
      d.horId,
      d.fecha,
      tickets,
      manager,
    );
    if (!disId) {
      const turno = (
        await this.inventory.cuposDelDia(atr.atr_id, d.fecha, manager)
      ).find((t) => t.horId === d.horId);
      throw new SinCupoError(
        turno ? Math.max(turno.total - turno.reservado, 0) : 0,
        turno?.total ?? 0,
      );
    }

    const codigo = generarCodigoReserva();
    const pagada = Boolean(d.pago);
    const mpaId = pagada ? await this.payments.metodoId(d.pago.metodo) : null;
    const { orden, detalles } = await this.orders.crear(
      {
        numero: `ORD-${codigo}`,
        usuId: d.usuId,
        canal: d.canal,
        referenciaExterna: d.referenciaExterna,
        correlationId: currentCorrelationId() ?? null,
        contactoCorreo: d.contacto.correo,
        contactoTelefono: d.contacto.telefono,
        estado: pagada ? CodigoEstadoOrden.PAGADA : CodigoEstadoOrden.CREADA,
        mpaId,
        observaciones: d.observaciones,
        lineas,
      },
      manager,
    );
    const principal =
      detalles.find((x) => x.det_tipo_pasajero === TipoTarifa.ADULTO) ??
      detalles[0];
    const reserva = await this.bookings.crear(
      {
        codigo,
        ordId: orden.ord_id,
        detId: principal.det_id,
        disId,
        estado: pagada
          ? CodigoEstadoReserva.CONFIRMADA
          : CodigoEstadoReserva.PENDIENTE_PAGO,
        ...d.pasajeros,
        precioUnitario: adulto,
        subtotal: total,
        observaciones: d.observaciones,
        titular: d.titular,
      },
      manager,
    );

    let pago: Pago | null = null;
    if (pagada && total > 0) {
      pago = await this.payments.registrarAprobado(
        {
          numero: `PAG-${codigo}`,
          ordId: orden.ord_id,
          metodo: d.pago.metodo,
          monto: total,
          referencia: d.pago.referencia,
          comprobanteUrl: d.pago.comprobanteUrl,
        },
        manager,
      );
    }
    await this.invoicing.emitir(
      {
        ordId: orden.ord_id,
        numero: `FAC-${codigo}`,
        estado: pagada
          ? CodigoEstadoFactura.PAGADA
          : CodigoEstadoFactura.NO_PAGADA,
        comprador: d.comprador,
        lineas: detalles.map((det) => this.lineaFactura(det)),
      },
      manager,
    );

    const vista = await this.armarVista(reserva, manager, {
      orden,
      atraccion: atr,
      pago,
      reembolso: null,
    });
    await this.registrarEventos(
      vista,
      pagada
        ? TipoEventoOutbox.RESERVA_CONFIRMADA
        : TipoEventoOutbox.RESERVA_CREADA,
      manager,
      d.referenciaExterna
        ? { booking_reservation_id: d.referenciaExterna }
        : {},
    );
    return vista;
  }

  async confirmarPago(
    vista: VistaReserva,
    pago: PagoRecibido,
    manager: EntityManager,
  ): Promise<VistaReserva> {
    const { reserva, orden } = vista;
    const registrado = await this.payments.registrarAprobado(
      {
        numero: `PAG-${reserva.res_codigo}`,
        ordId: orden.ord_id,
        metodo: pago.metodo,
        monto: orden.ord_total,
        referencia: pago.referencia,
        comprobanteUrl: pago.comprobanteUrl,
      },
      manager,
    );
    await this.orders.cambiarEstado(
      orden.ord_id,
      CodigoEstadoOrden.PAGADA,
      manager,
      registrado.mpa_id,
    );
    await this.invoicing.cambiarEstado(
      orden.ord_id,
      CodigoEstadoFactura.PAGADA,
      manager,
    );
    await this.bookings.actualizar(
      reserva.res_id,
      {
        est_id: await this.bookings.estadoId(CodigoEstadoReserva.CONFIRMADA),
        res_confirmado_en: new Date(),
      },
      manager,
    );
    const actual = await this.armarVista(
      await this.bookings.porId(reserva.res_id, manager),
      manager,
      {
        atraccion: vista.atraccion,
        pago: registrado,
        reembolso: null,
      },
    );
    await this.registrarEventos(
      actual,
      TipoEventoOutbox.RESERVA_CONFIRMADA,
      manager,
      {
        payment_method: pago.metodoApi ?? pago.metodo,
      },
    );
    return actual;
  }

  /**
   * Cancela, libera el cupo y, si estaba pagada, emite el reembolso.
   * Devuelve false si ya estaba cancelada (operación idempotente).
   */
  async cancelar(
    vista: VistaReserva,
    datos: { motivo: string | null; solicitante: string },
    manager: EntityManager,
  ): Promise<boolean> {
    const { reserva, orden } = vista;
    if (vista.estado === CodigoEstadoReserva.CANCELADA) return false;
    if (
      vista.estado === CodigoEstadoReserva.CHECKED_IN ||
      vista.estado === CodigoEstadoReserva.COMPLETADA
    ) {
      throw new ReservaUsadaError();
    }
    await this.bookings.actualizar(
      reserva.res_id,
      {
        est_id: await this.bookings.estadoId(CodigoEstadoReserva.CANCELADA),
        res_motivo_cancelacion: datos.motivo?.slice(0, 255) ?? null,
        res_cancelacion_solicitante: datos.solicitante,
        res_cancelado_en: new Date(),
      },
      manager,
    );
    await this.inventory.liberar(
      reserva.dis_id,
      reserva.res_numero_tickets,
      manager,
    );

    const pago = await this.payments.aprobado(orden.ord_id, manager);
    let reembolso: Reembolso | null = null;
    if (pago) {
      reembolso = await this.refunds.crear(
        {
          pagId: pago.pag_id,
          numero: `REF-${reserva.res_codigo}`,
          monto: pago.pag_monto,
          motivo: datos.motivo ?? "Cancelación de la reserva",
        },
        manager,
      );
    }
    await this.orders.cambiarEstado(
      orden.ord_id,
      pago ? CodigoEstadoOrden.REEMBOLSADA : CodigoEstadoOrden.CANCELADA,
      manager,
    );
    await this.invoicing.cambiarEstado(
      orden.ord_id,
      CodigoEstadoFactura.ANULADA,
      manager,
    );

    const actual = await this.armarVista(
      await this.bookings.porId(reserva.res_id, manager),
      manager,
      {
        atraccion: vista.atraccion,
        pago,
        reembolso,
      },
    );
    await this.registrarEventos(
      actual,
      TipoEventoOutbox.RESERVA_CANCELADA,
      manager,
      {
        ...(orden.ord_referencia_externa && {
          booking_reservation_id: orden.ord_referencia_externa,
        }),
        cancellation_reason: datos.motivo,
        requested_by: datos.solicitante,
      },
    );
    return true;
  }

  // --- Lectura ---

  async vistas(
    reservas: Reserva[],
    manager?: EntityManager,
  ): Promise<VistaReserva[]> {
    if (!reservas.length) return [];
    const ordenes = await this.orders.porIds(
      reservas.map((r) => r.ord_id),
      manager,
    );
    const turnos = await this.inventory.ubicaciones(
      reservas.map((r) => r.dis_id),
      manager,
    );
    const atracciones = new Map(
      (
        await this.catalog.findByIds([...turnos.values()].map((t) => t.atrId))
      ).map((a) => [a.atr_id, a]),
    );
    const pagos = await this.payments.aprobadosDe([...ordenes.keys()]);
    const resultado: VistaReserva[] = [];
    for (const r of reservas) {
      const pago = pagos.get(r.ord_id) ?? null;
      const turno = turnos.get(r.dis_id);
      resultado.push({
        reserva: r,
        estado: await this.bookings.codigoEstado(r.est_id),
        orden: ordenes.get(r.ord_id),
        turno,
        atraccion: atracciones.get(turno?.atrId),
        pago,
        reembolso: pago
          ? await this.refunds.dePago(pago.pag_id, manager)
          : null,
      });
    }
    return resultado;
  }

  async vista(
    reserva: Reserva,
    manager?: EntityManager,
  ): Promise<VistaReserva> {
    return (await this.vistas([reserva], manager))[0];
  }

  private async armarVista(
    reserva: Reserva,
    manager: EntityManager,
    conocido: {
      orden?: Orden;
      atraccion: Atraccion;
      pago: Pago | null;
      reembolso: Reembolso | null;
    },
  ): Promise<VistaReserva> {
    const orden =
      conocido.orden ?? (await this.orders.porId(reserva.ord_id, manager));
    const turno = (
      await this.inventory.ubicaciones([reserva.dis_id], manager)
    ).get(reserva.dis_id);
    return {
      reserva,
      estado: await this.bookings.codigoEstado(reserva.est_id),
      orden,
      turno,
      atraccion: conocido.atraccion,
      pago: conocido.pago,
      reembolso: conocido.reembolso,
    };
  }

  private lineaFactura(det: OrdenDetalle) {
    return {
      detId: det.det_id,
      codigo: `ATR-${det.atr_id}-${det.det_tipo_pasajero}`,
      descripcion: det.det_descripcion,
      cantidad: det.det_cantidad,
      precio: det.det_precio_unitario,
      subtotal: det.det_subtotal,
    };
  }

  // Evento de la reserva + stock del día, en la misma transacción (Transactional Outbox).
  private async registrarEventos(
    v: VistaReserva,
    tipo: TipoEventoOutbox,
    manager: EntityManager,
    extra: Record<string, unknown>,
  ): Promise<void> {
    const correlationId = currentCorrelationId() ?? randomUUID();
    const cupos = await this.inventory.cuposDelDia(
      v.atraccion.atr_id,
      v.turno.fecha,
      manager,
    );
    const slots = cupos.map((c) => ({
      slot_id: slotId(v.turno.fecha, c.hora),
      time_24h: `${c.hora}:00`,
      total_units: c.total,
      available_units: c.cerrada ? 0 : Math.max(c.total - c.reservado, 0),
    }));
    await this.bookings.registrarEventos(
      [
        {
          tipo,
          agregado: v.reserva.res_codigo,
          correlationId,
          payload: {
            reservation_id: v.reserva.res_uuid,
            reservation_code: v.reserva.res_codigo,
            external_order_id: v.orden.ord_numero,
            channel: v.orden.ord_canal,
            status: STATUS_EVENTO[v.estado],
            attraction_id: v.atraccion.atr_uuid,
            date: v.turno.fecha,
            time_24h: v.turno.hora,
            slot_id: slotId(v.turno.fecha, v.turno.hora),
            ticket_count: v.reserva.res_numero_tickets,
            total_price: v.reserva.res_subtotal,
            currency: "USD",
            ...extra,
          },
        },
        {
          tipo: TipoEventoOutbox.STOCK_ACTUALIZADO,
          agregado: v.atraccion.atr_uuid,
          correlationId,
          payload: {
            attraction_id: v.atraccion.atr_uuid,
            date: v.turno.fecha,
            total_units: slots.reduce((s, x) => s + x.total_units, 0),
            available_units: slots.reduce((s, x) => s + x.available_units, 0),
            slots,
          },
        },
      ],
      manager,
    );
  }
}
