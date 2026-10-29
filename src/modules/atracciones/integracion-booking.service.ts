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
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { Atraccion } from "./entities/atraccion.entity";
import { Cliente } from "./entities/cliente.entity";
import { DetalleReserva } from "./entities/detalle-reserva.entity";
import { Factura, EstadoPago } from "./entities/factura.entity";
import {
  CanalReserva,
  EstadoReserva,
  Pasajeros,
  Reserva,
} from "./entities/reserva.entity";
import { BOOKABLE_STATES } from "./atracciones.service";
import {
  CancelBookingReservaDto,
  CheckinBookingReservaDto,
  CreateBookingReservaDto,
  SolicitanteCancelacion,
  TipoDocumento,
} from "./dto/booking-reserva.dto";

const ERRORS_BASE = "https://booking.epn.edu.ec/errors";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descuentos por tipo de pasajero definidos en CreateReservaRequestV3.
const FACTOR_PRECIO = { adultos: 1, ninos: 0.5, seniors: 0.7, infantes: 0 };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_REGEX = /^ECT-[A-Z2-9]{6}$/;
const RELACIONES = ["detalles", "detalles.atraccion", "cliente"];
const PUNTO_ENCUENTRO = "Por confirmar con el operador";
const MENSAJE_ESTADO: Record<string, string> = {
  PENDING: "Reserva pendiente en Ecuatravel.",
  CONFIRMED: "Reserva confirmada en Ecuatravel.",
  CHECKED_IN: "Check-in registrado en Ecuatravel.",
  CANCELLED: "Reserva cancelada; cupos reintegrados y reembolso emitido.",
};

interface ReservaNormalizada {
  atraccionId: string;
  fecha: string;
  hora: string;
  slotId: string;
  pasajeros: Pasajeros;
  totalBoletos: number;
  nombre: string;
  email: string;
  telefono: string | null;
  documento: string;
  tipoDocumento: TipoDocumento;
  metodoPago: string;
  solicitudes: string | null;
  bookingReservationId: string | null;
}

function problem(
  status: HttpStatus,
  code: string,
  slug: string,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return new HttpException(
    { type: `${ERRORS_BASE}/${slug}`, title, status, detail, code, ...extra },
    status,
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// "10:30 a.m.", "2:00 PM", "10:30", "10:30:00" -> "10:30" (24 h). null si no es válida.
function toHora24(raw: string): string | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const meridiano = m[3]?.[0];
  if (meridiano) {
    if (h < 1 || h > 12) return null;
    if (meridiano === "p" && h < 12) h += 12;
    if (meridiano === "a" && h === 12) h = 0;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function horaLegible(hora24: string): string {
  const [h, min] = hora24.split(":").map(Number);
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

function igualSeguro(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// No se guarda el tipo de documento del turista; se deduce del formato.
function inferirTipoDocumento(documento: string): TipoDocumento {
  if (/^\d{10}$/.test(documento)) return TipoDocumento.CEDULA;
  if (/^\d{13}$/.test(documento)) return TipoDocumento.RUC;
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

function hoyEcuador(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
  }).format(new Date());
}

@Injectable()
export class IntegracionBookingService {
  private readonly logger = new Logger(IntegracionBookingService.name);
  private readonly voucherSecret: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    const secret =
      config.get<string>("VOUCHER_SECRET") ?? config.get<string>("JWT_SECRET");
    if (!secret) {
      throw new Error(
        "Defina VOUCHER_SECRET o JWT_SECRET para firmar vouchers.",
      );
    }
    this.voucherSecret = secret;
  }

  async crearReserva(
    dto: CreateBookingReservaDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const datos = this.normalizar(dto);

    const previa = await this.buscarPorIdempotencia(idempotencyKey);
    if (previa) {
      this.log("reserva.booking.replay", correlationId, {
        reservation_id: previa.id,
      });
      return this.toResponse(previa);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      // El bloqueo de la fila serializa reservas concurrentes de la misma atracción.
      const atraccion = UUID_REGEX.test(datos.atraccionId)
        ? await manager.findOne(Atraccion, {
            where: { id: datos.atraccionId },
            lock: { mode: "pessimistic_write" },
          })
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

      const ocupados = await this.boletosOcupados(
        manager,
        atraccion.id,
        datos.fecha,
      );
      const restantes =
        atraccion.estado === "ACTIVA"
          ? Math.max(atraccion.capacidad_diaria - ocupados, 0)
          : 0;
      if (datos.totalBoletos > restantes) {
        throw problem(
          HttpStatus.CONFLICT,
          "OUT_OF_STOCK",
          "sin-cupos",
          "Cupos Agotados para el Turno Solicitado",
          `La atracción ${atraccion.nombre} no dispone de ${datos.totalBoletos} cupos para el ` +
            `${datos.fecha} (${horaLegible(datos.hora)}). Cupos restantes: ${restantes}.`,
        );
      }

      const cliente = await this.obtenerCliente(manager, datos);

      const precioBase = Number(atraccion.precio_base);
      const total = round2(
        (Object.keys(FACTOR_PRECIO) as (keyof Pasajeros)[]).reduce(
          (acc, tipo) =>
            acc + precioBase * FACTOR_PRECIO[tipo] * datos.pasajeros[tipo],
          0,
        ),
      );

      const reserva = manager.create(Reserva, {
        fecha_reserva: datos.fecha,
        estado_reserva: EstadoReserva.CONFIRMADA,
        idempotency_key: idempotencyKey,
        canal: CanalReserva.BOOKING,
        codigo_reserva: this.generarCodigo(),
        hora_turno: datos.hora,
        slot_id: datos.slotId,
        booking_reservation_id: datos.bookingReservationId,
        correlation_id: correlationId,
        contacto_email: datos.email,
        solicitudes_especiales: datos.solicitudes,
        pasajeros: datos.pasajeros,
        cliente,
      });
      await manager.save(reserva);

      const detalle = manager.create(DetalleReserva, {
        reserva,
        atraccion,
        cantidad_boletos: datos.totalBoletos,
        precio_unitario_historico: precioBase,
        subtotal: total,
      });
      await manager.save(detalle);

      // Booking ya cobró al turista: la factura nace pagada.
      const factura = manager.create(Factura, {
        numero_factura: `FAC-${reserva.codigo_reserva}`,
        fecha_emision: hoyEcuador(),
        ruc_cliente: datos.documento,
        estado_pago: EstadoPago.PAGADO,
        total_pagado: total,
        metodo_pago: datos.metodoPago,
        transaction_id: datos.bookingReservationId,
        reserva,
        cliente,
      });
      await manager.save(factura);

      await queryRunner.commitTransaction();

      reserva.detalles = [{ ...detalle, atraccion }];
      this.log("reserva.booking.confirmada", correlationId, {
        reservation_id: reserva.id,
        reservation_code: reserva.codigo_reserva,
        attraction_id: atraccion.id,
        date: datos.fecha,
        time: datos.hora,
        tickets: datos.totalBoletos,
        booking_reservation_id: datos.bookingReservationId,
      });
      return this.toResponse(reserva);
    } catch (err) {
      await queryRunner.rollbackTransaction();

      if (err instanceof HttpException) {
        this.log("reserva.booking.rechazada", correlationId, {
          status: err.getStatus(),
          code: (err.getResponse() as any)?.code,
        });
        throw err;
      }

      // Dos reintentos simultáneos con la misma clave: gana uno y el otro
      // devuelve la misma respuesta.
      if (String(err?.code) === "23505") {
        const ganadora = await this.buscarPorIdempotencia(idempotencyKey);
        if (ganadora) return this.toResponse(ganadora);
      }

      this.logger.error(
        JSON.stringify({
          event: "reserva.booking.error",
          correlation_id: correlationId,
          error: err?.message,
        }),
      );
      throw new InternalServerErrorException("No se pudo registrar la reserva");
    } finally {
      await queryRunner.release();
    }
  }

  async obtenerReserva(id: string) {
    const reserva = await this.buscarReserva(this.dataSource.manager, id);
    if (!reserva) throw reservaNoEncontrada(id);
    return this.toResponse(reserva);
  }

  // Compensación de la Saga: repetir la cancelación devuelve 200 con el mismo estado,
  // por eso no depende de Idempotency-Key.
  async cancelarReserva(
    id: string,
    dto: CancelBookingReservaDto,
    correlationId: string,
  ) {
    return this.enTransaccion(
      "reserva.booking.cancelacion",
      correlationId,
      async (manager) => {
        const reserva = await this.buscarReserva(manager, id, true);
        if (!reserva) throw reservaNoEncontrada(id);

        if (reserva.estado_reserva === EstadoReserva.CANCELADA) {
          return this.toResponse(reserva);
        }
        if (reserva.checkin_at) {
          throw problem(
            HttpStatus.CONFLICT,
            "ALREADY_CHECKED_IN",
            "reserva-con-checkin",
            "La reserva ya registró check-in",
            `La reserva ${reserva.codigo_reserva} ya fue utilizada y no puede cancelarse.`,
          );
        }

        reserva.estado_reserva = EstadoReserva.CANCELADA;
        reserva.cancelada_at = new Date();
        reserva.cancelacion_motivo = dto.reason?.trim() || null;
        reserva.cancelacion_solicitante =
          dto.solicitante ?? SolicitanteCancelacion.CLIENTE;
        await manager.save(reserva);
        await manager.update(
          Factura,
          { reserva: { id: reserva.id } },
          { estado_pago: EstadoPago.REEMBOLSADO },
        );

        this.log("reserva.booking.cancelada", correlationId, {
          reservation_id: reserva.id,
          reservation_code: reserva.codigo_reserva,
          solicitante: reserva.cancelacion_solicitante,
          reason: reserva.cancelacion_motivo,
          tickets_liberados: reserva.detalles?.[0]?.cantidad_boletos ?? 0,
        });
        return this.toResponse(reserva);
      },
    );
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
        const reserva = await this.buscarReserva(manager, id, true);
        if (!reserva) throw reservaNoEncontrada(id);

        if (reserva.estado_reserva !== EstadoReserva.CONFIRMADA) {
          throw problem(
            HttpStatus.CONFLICT,
            "RESERVATION_NOT_ACTIVE",
            "reserva-no-activa",
            "La reserva no admite check-in",
            `La reserva ${reserva.codigo_reserva} está ${this.estadoContrato(reserva)}.`,
          );
        }
        if (dto.documento_identidad.toUpperCase() !== reserva.cliente?.dni) {
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
          !this.voucherValido(reserva, dto.codigo_voucher_qr)
        ) {
          throw problem(
            HttpStatus.FORBIDDEN,
            "VOUCHER_INVALID",
            "voucher-invalido",
            "Voucher inválido",
            "El código QR presentado no corresponde a esta reserva.",
          );
        }

        if (reserva.checkin_at) {
          // Reintento del mismo escaneo: se devuelve el pase ya emitido.
          if (reserva.checkin_idempotency_key === idempotencyKey) {
            return this.toCheckinResponse(reserva);
          }
          throw problem(
            HttpStatus.CONFLICT,
            "ALREADY_CHECKED_IN",
            "reserva-con-checkin",
            "La reserva ya registró check-in",
            `La reserva ${reserva.codigo_reserva} registró check-in el ${reserva.checkin_at.toISOString()}.`,
          );
        }

        reserva.checkin_at = new Date();
        reserva.checkin_guia =
          dto.guia_asignado?.trim() || dto.guia_codigo?.trim() || null;
        reserva.checkin_dispositivo = dto.scanner_device_id?.trim() || null;
        reserva.checkin_idempotency_key = idempotencyKey;
        await manager.save(reserva);

        this.log("reserva.booking.checkin", correlationId, {
          reservation_id: reserva.id,
          reservation_code: reserva.codigo_reserva,
          guia: reserva.checkin_guia,
          dispositivo: reserva.checkin_dispositivo,
        });
        return this.toCheckinResponse(reserva);
      },
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
    if (horaRaw && !hora) {
      invalid.push({ name: "time", reason: `Hora inválida: '${horaRaw}'.` });
    }

    const pasajeros: Pasajeros = {
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

    if (fecha < hoyEcuador()) {
      throw problem(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "DATE_IN_PAST",
        "fecha-pasada",
        "Fecha en el pasado",
        `No se puede reservar para ${fecha}.`,
      );
    }

    return {
      atraccionId,
      fecha,
      hora: horaSlot,
      slotId: dto.slot_id,
      pasajeros,
      totalBoletos,
      nombre,
      email: email.toLowerCase(),
      telefono: c.phone ?? c.telefono ?? null,
      documento: documento.toUpperCase(),
      tipoDocumento:
        c.document_type ?? c.tipo_documento ?? TipoDocumento.CEDULA,
      metodoPago: dto.payment_method?.method ?? "BOOKING",
      solicitudes: dto.special_requirements?.trim() || null,
      bookingReservationId: dto.booking_reservation_id ?? null,
    };
  }

  private buscarPorIdempotencia(key: string): Promise<Reserva | null> {
    return this.dataSource.getRepository(Reserva).findOne({
      where: { idempotency_key: key },
      relations: RELACIONES,
    });
  }

  // Acepta UUID, código PNR (ECT-XXXXXX) o el booking_reservation_id de Booking.
  // Solo expone reservas del canal BOOKING: la API key no da acceso a las ventas web.
  private async buscarReserva(
    manager: EntityManager,
    id: string,
    bloquear = false,
  ): Promise<Reserva | null> {
    const valor = id.trim();
    const where = UUID_REGEX.test(valor)
      ? { id: valor }
      : CODE_REGEX.test(valor.toUpperCase())
        ? { codigo_reserva: valor.toUpperCase() }
        : { booking_reservation_id: valor };

    // FOR UPDATE no admite LEFT JOIN en PostgreSQL: primero se bloquea la fila.
    const base = await manager.findOne(Reserva, {
      where: { ...where, canal: CanalReserva.BOOKING },
      ...(bloquear && { lock: { mode: "pessimistic_write" as const } }),
    });
    if (!base) return null;
    return manager.findOne(Reserva, {
      where: { id: base.id },
      relations: RELACIONES,
    });
  }

  private async enTransaccion<T>(
    evento: string,
    correlationId: string,
    fn: (manager: EntityManager) => Promise<T>,
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

  private async boletosOcupados(
    manager: EntityManager,
    atraccionId: string,
    fecha: string,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder(DetalleReserva, "d")
      .innerJoin("d.reserva", "r")
      .select("COALESCE(SUM(d.cantidad_boletos), 0)", "sum")
      .where("d.atraccion_id = :atraccionId", { atraccionId })
      .andWhere("r.fecha_reserva = :fecha", { fecha })
      .andWhere("r.estado_reserva IN (:...estados)", {
        estados: BOOKABLE_STATES,
      })
      .getRawOne();
    return Number(row?.sum ?? 0);
  }

  // El turista de Booking no tiene cuenta local: se identifica por documento.
  private async obtenerCliente(
    manager: EntityManager,
    datos: ReservaNormalizada,
  ): Promise<Cliente> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(Cliente)
      .values({
        dni: datos.documento,
        nombre_completo: datos.nombre,
        telefono: datos.telefono,
      })
      .orIgnore()
      .execute();
    return manager.findOneOrFail(Cliente, { where: { dni: datos.documento } });
  }

  private generarCodigo(): string {
    let code = "ECT-";
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
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

  private firmarVoucher(reserva: Reserva): string {
    return this.sellar("voucher", {
      rid: reserva.id,
      code: reserva.codigo_reserva,
      date: String(reserva.fecha_reserva).slice(0, 10),
      time: reserva.hora_turno,
    });
  }

  private voucherValido(reserva: Reserva, codigo: string): boolean {
    const valor = codigo.trim();
    if (valor.toUpperCase() === reserva.codigo_reserva) return true;
    const [payload, firma] = valor.split(".");
    if (!payload || !firma) return false;
    if (!igualSeguro(firma, this.firma("voucher", payload))) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data?.rid === reserva.id;
    } catch {
      return false;
    }
  }

  private estadoContrato(reserva: Reserva): string {
    if (reserva.estado_reserva === EstadoReserva.CANCELADA) return "CANCELLED";
    if (reserva.estado_reserva === EstadoReserva.CONFIRMADA) {
      return reserva.checkin_at ? "CHECKED_IN" : "CONFIRMED";
    }
    return "PENDING";
  }

  private toCheckinResponse(reserva: Reserva) {
    const horaCheckin = reserva.checkin_at.toISOString();
    return {
      success: true,
      reserva_id: reserva.id,
      reservation_code: reserva.codigo_reserva,
      estado: "CHECKED_IN",
      status: "CHECKED_IN",
      titular_nombre: reserva.cliente?.nombre_completo,
      titular_documento: reserva.cliente?.dni,
      guia_asignado: reserva.checkin_guia ?? "Por asignar",
      punto_encuentro: PUNTO_ENCUENTRO,
      hora_checkin: horaCheckin,
      pase_abordar_qr: this.sellar("pase", {
        rid: reserva.id,
        code: reserva.codigo_reserva,
        checkin: horaCheckin,
      }),
    };
  }

  private toResponse(reserva: Reserva) {
    const detalle = reserva.detalles?.[0];
    const p = reserva.pasajeros;
    const fecha = String(reserva.fecha_reserva).slice(0, 10);
    const hora = reserva.hora_turno ? horaLegible(reserva.hora_turno) : null;
    const total = Number(detalle?.subtotal ?? 0);
    const status = this.estadoContrato(reserva);
    const self = `/api/v3/atracciones/reservas/${reserva.id}`;
    const cliente = reserva.cliente;

    return {
      success: true,
      message: MENSAJE_ESTADO[status],
      external_order_id: `ORD-${reserva.codigo_reserva}`,
      reservation_id: reserva.id,
      reservation_code: reserva.codigo_reserva,
      status,
      estado: status,
      attraction_id: detalle?.atraccion?.id,
      slot_id: reserva.slot_id,
      date: fecha,
      fecha,
      time: hora,
      hora,
      time_24h: reserva.hora_turno ? `${reserva.hora_turno}:00` : null,
      ticket_count: detalle?.cantidad_boletos ?? 0,
      adult_count: p?.adultos ?? 0,
      child_count: p?.ninos ?? 0,
      senior_count: p?.seniors ?? 0,
      student_count: 0,
      infant_count: p?.infantes ?? 0,
      cantidad_adultos: p?.adultos ?? 0,
      cantidad_ninos: p?.ninos ?? 0,
      cantidad_seniors: p?.seniors ?? 0,
      cantidad_estudiantes: 0,
      cantidad_infantes: p?.infantes ?? 0,
      total_price: total,
      precio_total: total,
      currency: "USD",
      moneda: "USD",
      booking_reservation_id: reserva.booking_reservation_id,
      customer: cliente && {
        full_name: cliente.nombre_completo,
        nombre_completo: cliente.nombre_completo,
        email: reserva.contacto_email,
        correo: reserva.contacto_email,
        phone: cliente.telefono,
        telefono: cliente.telefono,
        document_type: inferirTipoDocumento(cliente.dni),
        document_id: cliente.dni,
      },
      guia_asignado: reserva.checkin_guia ?? "Por asignar",
      punto_encuentro: PUNTO_ENCUENTRO,
      voucher_qr_payload: this.firmarVoucher(reserva),
      ...(reserva.checkin_at && {
        hora_checkin: reserva.checkin_at.toISOString(),
      }),
      ...(status === "CANCELLED" && {
        reembolso_id: `REF-${reserva.codigo_reserva}`,
        monto_reembolsado: total,
        cancelled_at: reserva.cancelada_at?.toISOString() ?? null,
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

  private log(event: string, correlationId: string, data: object) {
    this.logger.log(
      JSON.stringify({ event, correlation_id: correlationId, ...data }),
    );
  }
}
