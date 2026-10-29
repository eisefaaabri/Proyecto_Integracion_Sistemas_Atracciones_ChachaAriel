import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { EstadoAtraccion } from "../catalog/catalog.entities";
import { CatalogService } from "../catalog/catalog.service";
import { InventoryService } from "../inventory/inventory.service";
import { OrderService, hashSolicitud } from "../order/order.service";
import { CanalOrden } from "../order/order.entities";
import { BookingService } from "../booking/booking.service";
import { CodigoEstadoReserva, Reserva } from "../booking/booking.entities";
import { PaymentService } from "../payment/payment.service";
import { CONSUMIDOR_FINAL } from "../billing-profile/billing-profile.service";
import { DisponibilidadAppService } from "./disponibilidad-app.service";
import {
  ReservaUsadaError,
  ReservasAppService,
  SinCupoError,
  VistaReserva,
} from "./reservas-app.service";
import {
  UUID_REGEX,
  horaActualEcuador,
  horaLegible,
  hoyEcuador,
  problem,
  toHora24,
} from "./booking.utils";
import {
  CancelBookingReservaDto,
  CheckinBookingReservaDto,
  CreateBookingReservaDto,
  SolicitanteCancelacion,
  TipoDocumento,
} from "./dto/booking-reserva.dto";

const CODE_REGEX = /^ECT-[A-Z2-9]{6}$/;
const PUNTO_ENCUENTRO = "Por confirmar con el operador";
const SUJETO_BOOKING = "canal:BOOKING";
const MENSAJE_ESTADO: Record<string, string> = {
  PENDING: "Reserva pendiente en Ecuatravel.",
  CONFIRMED: "Reserva confirmada en Ecuatravel.",
  CHECKED_IN: "Check-in registrado en Ecuatravel.",
  COMPLETED: "Reserva completada en Ecuatravel.",
  CANCELLED: "Reserva cancelada; cupos reintegrados y reembolso emitido.",
};

interface ReservaNormalizada {
  atraccionId: string;
  fecha: string;
  hora: string;
  pasajeros: {
    adultos: number;
    ninos: number;
    seniors: number;
    infantes: number;
  };
  totalBoletos: number;
  nombre: string;
  email: string;
  telefono: string | null;
  documento: string;
  tipoDocumento: TipoDocumento;
  metodoPago: string | null;
  solicitudes: string | null;
  bookingReservationId: string | null;
}

function igualSeguro(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// No se guarda el tipo de documento del turista; se deduce del formato.
function inferirTipoDocumento(documento: string | null): TipoDocumento {
  if (documento && /^\d{10}$/.test(documento)) return TipoDocumento.CEDULA;
  if (documento && /^\d{13}$/.test(documento)) return TipoDocumento.RUC;
  return TipoDocumento.PASAPORTE;
}

function reservaNoEncontrada(id: string) {
  return problem(
    HttpStatus.NOT_FOUND,
    "RESERVATION_NOT_FOUND",
    "reserva-no-encontrada",
    "Reserva no encontrada",
    `No existe una reserva de Booking con identificador '${id}'.`,
  );
}

function estadoContrato(estado: CodigoEstadoReserva): string {
  switch (estado) {
    case CodigoEstadoReserva.CANCELADA:
      return "CANCELLED";
    case CodigoEstadoReserva.CHECKED_IN:
      return "CHECKED_IN";
    case CodigoEstadoReserva.COMPLETADA:
      return "COMPLETED";
    case CodigoEstadoReserva.CONFIRMADA:
      return "CONFIRMED";
    default:
      return "PENDING";
  }
}

@Injectable()
export class IntegracionBookingService {
  private readonly logger = new Logger(IntegracionBookingService.name);
  private readonly voucherSecret: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
    private readonly orders: OrderService,
    private readonly bookings: BookingService,
    private readonly payments: PaymentService,
    private readonly reservas: ReservasAppService,
    private readonly disponibilidad: DisponibilidadAppService,
    config: ConfigService,
  ) {
    const secret =
      config.get<string>("VOUCHER_SECRET") ?? config.get<string>("JWT_SECRET");
    if (!secret)
      throw new Error(
        "Defina VOUCHER_SECRET o JWT_SECRET para firmar vouchers.",
      );
    this.voucherSecret = secret;
  }

  async crearReserva(
    dto: CreateBookingReservaDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const datos = this.normalizar(dto);
    const hash = hashSolicitud(dto);

    const previa = await this.orders.claveExistente(
      idempotencyKey,
      SUJETO_BOOKING,
    );
    if (previa?.idem_recurso_id) {
      this.log("reserva.booking.replay", correlationId, {
        reservation_id: previa.idem_recurso_id,
      });
      return this.respuestaDe(previa.idem_recurso_id);
    }

    let atrUuid: string | null = null;
    try {
      const respuesta = await this.dataSource.transaction(async (manager) => {
        // La clave se toma primero: un reintento concurrente espera y luego devuelve lo mismo.
        const tomada = await this.orders.tomarClave(
          idempotencyKey,
          SUJETO_BOOKING,
          "POST /reservas",
          hash,
          manager,
        );
        if (tomada?.idem_recurso_id) return { replay: tomada.idem_recurso_id };

        const atrBase = UUID_REGEX.test(datos.atraccionId)
          ? await this.catalog.findByUuid(datos.atraccionId, manager)
          : null;
        // El bloqueo de la fila serializa reservas concurrentes de la misma atracción.
        const atraccion =
          atrBase && (await this.catalog.bloquear(atrBase.atr_id, manager))
            ? atrBase
            : null;
        if (!atraccion) {
          throw problem(
            HttpStatus.NOT_FOUND,
            "ATTRACTION_NOT_FOUND",
            "atraccion-no-encontrada",
            "Atracción no encontrada",
            `No existe la atracción '${datos.atraccionId}'.`,
          );
        }
        atrUuid = atraccion.atr_uuid;
        const turno = (
          await this.inventory.cuposDelDia(
            atraccion.atr_id,
            datos.fecha,
            manager,
          )
        ).find((t) => t.hora === datos.hora);
        if (!turno) {
          throw problem(
            HttpStatus.BAD_REQUEST,
            "INVALID_SLOT",
            "slot-invalido",
            "Turno horario inválido",
            `La atracción ${atraccion.atr_nombre} no opera a las ${horaLegible(datos.hora)}.`,
          );
        }
        if (atraccion.atr_estado !== EstadoAtraccion.PUBLICADA) {
          throw this.sinCupo(atraccion.atr_nombre, datos, 0);
        }

        const vista = await this.reservas
          .crear(
            {
              atraccion,
              fecha: datos.fecha,
              horId: turno.horId,
              pasajeros: datos.pasajeros,
              canal: CanalOrden.BOOKING,
              usuId: null,
              titular: { nombre: datos.nombre, documento: datos.documento },
              contacto: { correo: datos.email, telefono: datos.telefono },
              comprador: {
                tipoIdentificacion: datos.tipoDocumento,
                identificacion: datos.documento,
                razonSocial: datos.nombre,
                correo: datos.email,
                telefono: datos.telefono,
              },
              // Booking ya cobró al turista: la orden nace pagada.
              pago: {
                metodo: this.payments.codigoMetodo(datos.metodoPago),
                referencia: datos.bookingReservationId,
              },
              referenciaExterna: datos.bookingReservationId,
              observaciones: datos.solicitudes,
            },
            manager,
          )
          .catch((err) => {
            if (err instanceof SinCupoError)
              throw this.sinCupo(atraccion.atr_nombre, datos, err.disponibles);
            throw err;
          });

        const cuerpo = this.toResponse(vista);
        await this.orders.completarClave(
          idempotencyKey,
          SUJETO_BOOKING,
          vista.reserva.res_uuid,
          cuerpo,
          manager,
        );
        this.log("reserva.booking.confirmada", correlationId, {
          reservation_id: vista.reserva.res_uuid,
          reservation_code: vista.reserva.res_codigo,
          attraction_id: atraccion.atr_uuid,
          date: datos.fecha,
          time: datos.hora,
          tickets: datos.totalBoletos,
          booking_reservation_id: datos.bookingReservationId,
        });
        return { cuerpo };
      });

      if ("replay" in respuesta) return this.respuestaDe(respuesta.replay);
      void this.disponibilidad.notificarStock(
        atrUuid,
        datos.fecha,
        correlationId,
      );
      return respuesta.cuerpo;
    } catch (err) {
      if (err instanceof HttpException) {
        this.log("reserva.booking.rechazada", correlationId, {
          status: err.getStatus(),
          code: (err.getResponse() as any)?.code,
        });
        throw err;
      }
      // Dos reintentos simultáneos con la misma clave: gana uno y el otro devuelve lo mismo.
      if (String(err?.code) === "23505") {
        const ganadora = await this.orders.claveExistente(
          idempotencyKey,
          SUJETO_BOOKING,
        );
        if (ganadora?.idem_recurso_id)
          return this.respuestaDe(ganadora.idem_recurso_id);
      }
      this.logger.error(
        JSON.stringify({
          event: "reserva.booking.error",
          correlation_id: correlationId,
          error: err?.message,
        }),
      );
      throw new InternalServerErrorException("No se pudo registrar la reserva");
    }
  }

  async obtenerReserva(id: string) {
    const vista = await this.buscarReserva(this.dataSource.manager, id);
    if (!vista) throw reservaNoEncontrada(id);
    return this.toResponse(vista);
  }

  // Compensación de la Saga: repetir la cancelación devuelve 200 con el mismo estado,
  // por eso no depende de Idempotency-Key.
  async cancelarReserva(
    id: string,
    dto: CancelBookingReservaDto,
    correlationId: string,
  ) {
    let liberada: { atrUuid: string; fecha: string } | null = null;
    const respuesta = await this.enTransaccion(
      "reserva.booking.cancelacion",
      correlationId,
      async (manager) => {
        const vista = await this.buscarReserva(manager, id, true);
        if (!vista) throw reservaNoEncontrada(id);
        const solicitante = dto.solicitante ?? SolicitanteCancelacion.CLIENTE;
        const motivo = dto.reason?.trim() || null;
        try {
          const cambio = await this.reservas.cancelar(
            vista,
            { motivo, solicitante },
            manager,
          );
          if (!cambio) return this.toResponse(vista);
        } catch (err) {
          if (err instanceof ReservaUsadaError) {
            throw problem(
              HttpStatus.CONFLICT,
              "ALREADY_CHECKED_IN",
              "reserva-con-checkin",
              "La reserva ya registró check-in",
              `La reserva ${vista.reserva.res_codigo} ya fue utilizada y no puede cancelarse.`,
            );
          }
          throw err;
        }
        const actual = await this.buscarReserva(
          manager,
          vista.reserva.res_uuid,
        );
        this.log("reserva.booking.cancelada", correlationId, {
          reservation_id: actual.reserva.res_uuid,
          reservation_code: actual.reserva.res_codigo,
          solicitante,
          reason: motivo,
          tickets_liberados: actual.reserva.res_numero_tickets,
        });
        liberada = {
          atrUuid: actual.atraccion.atr_uuid,
          fecha: actual.turno.fecha,
        };
        return this.toResponse(actual);
      },
    );
    // Después del commit, para que la lectura del aforo vea los cupos liberados.
    if (liberada)
      void this.disponibilidad.notificarStock(
        liberada.atrUuid,
        liberada.fecha,
        correlationId,
      );
    return respuesta;
  }

  async registrarCheckin(
    id: string,
    dto: CheckinBookingReservaDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.enTransaccion(
      "reserva.booking.checkin",
      correlationId,
      async (manager) => {
        const vista = await this.buscarReserva(manager, id, true);
        if (!vista) throw reservaNoEncontrada(id);
        const { reserva } = vista;

        if (
          vista.estado !== CodigoEstadoReserva.CONFIRMADA &&
          vista.estado !== CodigoEstadoReserva.CHECKED_IN
        ) {
          throw problem(
            HttpStatus.CONFLICT,
            "RESERVATION_NOT_ACTIVE",
            "reserva-no-activa",
            "La reserva no admite check-in",
            `La reserva ${reserva.res_codigo} está ${estadoContrato(vista.estado)}.`,
          );
        }
        const titular = this.bookings.titular(reserva);
        if (dto.documento_identidad.toUpperCase() !== titular?.pax_documento) {
          throw problem(
            HttpStatus.FORBIDDEN,
            "IDENTITY_MISMATCH",
            "identidad-no-coincide",
            "Documento de identidad no coincide",
            "El documento presentado no corresponde al titular de la reserva.",
          );
        }
        if (
          dto.codigo_voucher_qr &&
          !this.voucherValido(vista, dto.codigo_voucher_qr)
        ) {
          throw problem(
            HttpStatus.FORBIDDEN,
            "VOUCHER_INVALID",
            "voucher-invalido",
            "Voucher inválido",
            "El código QR presentado no corresponde a esta reserva.",
          );
        }
        if (reserva.res_checkin_en) {
          // Reintento del mismo escaneo: se devuelve el pase ya emitido.
          if (reserva.res_checkin_idempotencia === idempotencyKey)
            return this.toCheckinResponse(vista);
          throw problem(
            HttpStatus.CONFLICT,
            "ALREADY_CHECKED_IN",
            "reserva-con-checkin",
            "La reserva ya registró check-in",
            `La reserva ${reserva.res_codigo} registró check-in el ${reserva.res_checkin_en.toISOString()}.`,
          );
        }

        await this.bookings.actualizar(
          reserva.res_id,
          {
            est_id: await this.bookings.estadoId(
              CodigoEstadoReserva.CHECKED_IN,
            ),
            res_checkin_en: new Date(),
            res_checkin_guia:
              dto.guia_asignado?.trim() || dto.guia_codigo?.trim() || null,
            res_checkin_dispositivo: dto.scanner_device_id?.trim() || null,
            res_checkin_idempotencia: idempotencyKey,
          },
          manager,
        );
        const actual = await this.buscarReserva(manager, reserva.res_uuid);
        this.log("reserva.booking.checkin", correlationId, {
          reservation_id: reserva.res_uuid,
          reservation_code: reserva.res_codigo,
          guia: actual.reserva.res_checkin_guia,
          dispositivo: actual.reserva.res_checkin_dispositivo,
        });
        return this.toCheckinResponse(actual);
      },
    );
  }

  private sinCupo(
    nombre: string,
    datos: ReservaNormalizada,
    restantes: number,
  ) {
    return problem(
      HttpStatus.CONFLICT,
      "OUT_OF_STOCK",
      "sin-cupos",
      "Cupos Agotados para el Turno Solicitado",
      `La atracción ${nombre} no dispone de ${datos.totalBoletos} cupos para el ` +
        `${datos.fecha} (${horaLegible(datos.hora)}). Cupos restantes: ${restantes}.`,
    );
  }

  private normalizar(dto: CreateBookingReservaDto): ReservaNormalizada {
    const invalid: { name: string; reason: string }[] = [];
    const c = dto.customer;

    const atraccionId = dto.attraction_id ?? dto.atraccion_id;
    const fecha = dto.date ?? dto.fecha;
    const horaRaw = dto.time ?? dto.hora ?? dto.time_24h;
    const nombre = (c.full_name ?? c.nombre_completo ?? c.name)?.trim();
    const email = c.email ?? c.correo;
    const documento = c.document_id ?? c.numero_documento;

    if (!atraccionId)
      invalid.push({ name: "attraction_id", reason: "Es obligatorio." });
    if (!fecha) invalid.push({ name: "date", reason: "Es obligatorio." });
    if (!nombre)
      invalid.push({ name: "customer.full_name", reason: "Es obligatorio." });
    if (!email)
      invalid.push({ name: "customer.email", reason: "Es obligatorio." });
    if (!documento)
      invalid.push({ name: "customer.document_id", reason: "Es obligatorio." });

    const hora = horaRaw ? toHora24(horaRaw) : null;
    if (horaRaw && !hora)
      invalid.push({ name: "time", reason: `Hora inválida: '${horaRaw}'.` });

    const pasajeros = {
      adultos: dto.adult_count,
      ninos: dto.child_count ?? 0,
      seniors: dto.senior_count ?? 0,
      infantes: dto.infant_count ?? 0,
    };
    const totalBoletos =
      pasajeros.adultos +
      pasajeros.ninos +
      pasajeros.seniors +
      pasajeros.infantes;
    if (dto.total_tickets !== undefined && dto.total_tickets !== totalBoletos) {
      invalid.push({
        name: "total_tickets",
        reason: `Debe ser ${totalBoletos} (suma de adultos, niños, seniors e infantes).`,
      });
    }
    if (invalid.length) {
      throw problem(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_FAILED",
        "validacion",
        "Solicitud inválida",
        "Uno o más campos no cumplen el contrato.",
        { invalid_params: invalid },
      );
    }

    // slot_id es la clave del turno; date y time deben coincidir con él.
    const [, ymd, hm] = dto.slot_id.split("-");
    const fechaSlot = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const horaSlot = toHora24(`${hm.slice(0, 2)}:${hm.slice(2, 4)}`);
    const fechaSlotValida =
      !Number.isNaN(Date.parse(fechaSlot)) &&
      new Date(fechaSlot).toISOString().startsWith(fechaSlot);
    if (!fechaSlotValida || !horaSlot) {
      throw problem(
        HttpStatus.BAD_REQUEST,
        "INVALID_SLOT",
        "slot-invalido",
        "Turno horario inválido",
        `El slot_id '${dto.slot_id}' no representa una fecha y hora reales.`,
      );
    }
    if (fecha !== fechaSlot || (hora && hora !== horaSlot)) {
      throw problem(
        HttpStatus.BAD_REQUEST,
        "SLOT_TIME_MISMATCH",
        "slot-mismatch",
        "Inconsistencia de Franja Horaria (Slot Time Mismatch)",
        `El slot_id '${dto.slot_id}' codifica ${fechaSlot} ${horaSlot}, ` +
          `pero la petición envió ${fecha} ${hora ?? ""}`.trim() +
          ".",
      );
    }
    const hoy = hoyEcuador();
    if (fecha < hoy || (fecha === hoy && horaSlot <= horaActualEcuador())) {
      throw problem(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "DATE_IN_PAST",
        "fecha-pasada",
        "Fecha en el pasado",
        `El turno ${fecha} ${horaSlot} ya comenzó o pasó.`,
      );
    }

    const doc = documento.toUpperCase();
    return {
      atraccionId,
      fecha,
      hora: horaSlot,
      pasajeros,
      totalBoletos,
      nombre,
      email: email.toLowerCase(),
      telefono: c.phone ?? c.telefono ?? null,
      documento: doc,
      tipoDocumento:
        c.document_type ?? c.tipo_documento ?? inferirTipoDocumento(doc),
      metodoPago: dto.payment_method?.method ?? null,
      solicitudes: dto.special_requirements?.trim() || null,
      bookingReservationId: dto.booking_reservation_id ?? null,
    };
  }

  private async respuestaDe(resUuid: string) {
    const vista = await this.buscarReserva(this.dataSource.manager, resUuid);
    return this.toResponse(vista);
  }

  // Acepta UUID, código PNR (ECT-XXXXXX) o el booking_reservation_id de Booking.
  // Solo expone reservas del canal BOOKING: la API key no da acceso a las ventas web.
  private async buscarReserva(
    manager: EntityManager,
    id: string,
    bloquear = false,
  ): Promise<VistaReserva | null> {
    const valor = id.trim();
    let reserva: Reserva | null = null;
    if (UUID_REGEX.test(valor)) {
      reserva = await this.bookings.porUuid(valor, manager);
    } else if (CODE_REGEX.test(valor.toUpperCase())) {
      reserva = await this.bookings.porCodigo(valor.toUpperCase(), manager);
    } else {
      const ordenes = await this.orders.porReferenciaExterna(valor);
      [reserva] = await this.bookings.porOrdenes(
        ordenes.map((o) => o.ord_id),
        manager,
      );
    }
    if (!reserva) return null;
    if (bloquear)
      reserva = await this.bookings.bloquear(reserva.res_id, manager);
    const vista = await this.reservas.vista(reserva, manager);
    return vista.orden?.ord_canal === CanalOrden.BOOKING ? vista : null;
  }

  private async enTransaccion<T>(
    evento: string,
    correlationId: string,
    fn: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(fn);
    } catch (err) {
      if (err instanceof HttpException) {
        this.log(`${evento}.rechazada`, correlationId, {
          status: err.getStatus(),
          code: (err.getResponse() as any)?.code,
        });
        throw err;
      }
      this.logger.error(
        JSON.stringify({
          event: `${evento}.error`,
          correlation_id: correlationId,
          error: err?.message,
        }),
      );
      throw new InternalServerErrorException(
        "No se pudo procesar la solicitud",
      );
    }
  }

  private firma(ambito: string, payload: string): string {
    return createHmac("sha256", this.voucherSecret)
      .update(`${ambito}.${payload}`)
      .digest("base64url");
  }

  private sellar(ambito: string, data: object): string {
    const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
    return `${payload}.${this.firma(ambito, payload)}`;
  }

  private firmarVoucher(v: VistaReserva): string {
    return this.sellar("voucher", {
      rid: v.reserva.res_uuid,
      code: v.reserva.res_codigo,
      date: v.turno.fecha,
      time: v.turno.hora,
    });
  }

  private voucherValido(v: VistaReserva, codigo: string): boolean {
    const valor = codigo.trim();
    if (valor.toUpperCase() === v.reserva.res_codigo) return true;
    const [payload, firma] = valor.split(".");
    if (!payload || !firma) return false;
    if (!igualSeguro(firma, this.firma("voucher", payload))) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data?.rid === v.reserva.res_uuid;
    } catch {
      return false;
    }
  }

  private puntoEncuentro(v: VistaReserva): string {
    return v.atraccion?.atr_punto_encuentro || PUNTO_ENCUENTRO;
  }

  private toCheckinResponse(v: VistaReserva) {
    const { reserva } = v;
    const titular = this.bookings.titular(reserva);
    const horaCheckin = reserva.res_checkin_en.toISOString();
    return {
      success: true,
      reserva_id: reserva.res_uuid,
      reservation_code: reserva.res_codigo,
      estado: "CHECKED_IN",
      status: "CHECKED_IN",
      titular_nombre: titular?.pax_nombre,
      titular_documento: titular?.pax_documento,
      guia_asignado: reserva.res_checkin_guia ?? "Por asignar",
      punto_encuentro: this.puntoEncuentro(v),
      hora_checkin: horaCheckin,
      pase_abordar_qr: this.sellar("pase", {
        rid: reserva.res_uuid,
        code: reserva.res_codigo,
        checkin: horaCheckin,
      }),
    };
  }

  private toResponse(v: VistaReserva) {
    const { reserva, orden, turno } = v;
    const status = estadoContrato(v.estado);
    const hora = horaLegible(turno.hora);
    const total = reserva.res_subtotal;
    const self = `/api/v3/atracciones/reservas/${reserva.res_uuid}`;
    const titular = this.bookings.titular(reserva);
    const documento = titular?.pax_documento ?? null;

    return {
      success: true,
      message: MENSAJE_ESTADO[status],
      external_order_id: orden.ord_numero,
      reservation_id: reserva.res_uuid,
      reservation_code: reserva.res_codigo,
      status,
      estado: status,
      attraction_id: v.atraccion?.atr_uuid,
      slot_id: `slot-${turno.fecha.replace(/-/g, "")}-${turno.hora.replace(":", "")}`,
      date: turno.fecha,
      fecha: turno.fecha,
      time: hora,
      hora,
      time_24h: `${turno.hora}:00`,
      ticket_count: reserva.res_numero_tickets,
      adult_count: reserva.res_adultos,
      child_count: reserva.res_ninos,
      senior_count: reserva.res_seniors,
      student_count: 0,
      infant_count: reserva.res_infantes,
      cantidad_adultos: reserva.res_adultos,
      cantidad_ninos: reserva.res_ninos,
      cantidad_seniors: reserva.res_seniors,
      cantidad_estudiantes: 0,
      cantidad_infantes: reserva.res_infantes,
      total_price: total,
      precio_total: total,
      currency: "USD",
      moneda: "USD",
      booking_reservation_id: orden.ord_referencia_externa,
      customer: titular && {
        full_name: titular.pax_nombre,
        nombre_completo: titular.pax_nombre,
        email: orden.ord_contacto_correo,
        correo: orden.ord_contacto_correo,
        phone: orden.ord_contacto_telefono,
        telefono: orden.ord_contacto_telefono,
        document_type:
          documento === CONSUMIDOR_FINAL
            ? TipoDocumento.RUC
            : inferirTipoDocumento(documento),
        document_id: documento,
      },
      guia_asignado: reserva.res_checkin_guia ?? "Por asignar",
      punto_encuentro: this.puntoEncuentro(v),
      voucher_qr_payload: this.firmarVoucher(v),
      ...(reserva.res_checkin_en && {
        hora_checkin: reserva.res_checkin_en.toISOString(),
      }),
      ...(status === "CANCELLED" && {
        reembolso_id: v.reembolso?.rem_numero ?? `REF-${reserva.res_codigo}`,
        monto_reembolsado: v.reembolso?.rem_monto ?? total,
        cancelled_at: reserva.res_cancelado_en?.toISOString() ?? null,
      }),
      _links: {
        self,
        ...(status === "CONFIRMED" && {
          checkin: `${self}/checkin`,
          cancel: `${self}/cancel`,
        }),
      },
    };
  }

  private log(event: string, correlationId: string | undefined, data: object) {
    this.logger.log(
      JSON.stringify({ event, correlation_id: correlationId, ...data }),
    );
  }
}
