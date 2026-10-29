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
import { createHmac, randomInt } from "crypto";
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
  CreateBookingReservaDto,
  TipoDocumento,
} from "./dto/booking-reserva.dto";

const ERRORS_BASE = "https://booking.epn.edu.ec/errors";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descuentos por tipo de pasajero definidos en CreateReservaRequestV3.
const FACTOR_PRECIO = { adultos: 1, ninos: 0.5, seniors: 0.7, infantes: 0 };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
      relations: ["detalles", "detalles.atraccion"],
    });
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

  private firmarVoucher(reserva: Reserva): string {
    const payload = Buffer.from(
      JSON.stringify({
        rid: reserva.id,
        code: reserva.codigo_reserva,
        date: reserva.fecha_reserva,
        time: reserva.hora_turno,
      }),
    ).toString("base64url");
    const firma = createHmac("sha256", this.voucherSecret)
      .update(`voucher.${payload}`)
      .digest("base64url");
    return `${payload}.${firma}`;
  }

  private toResponse(reserva: Reserva) {
    const detalle = reserva.detalles?.[0];
    const p = reserva.pasajeros;
    const fecha = String(reserva.fecha_reserva).slice(0, 10);
    const hora = reserva.hora_turno ? horaLegible(reserva.hora_turno) : null;
    const total = Number(detalle?.subtotal ?? 0);
    const status =
      reserva.estado_reserva === EstadoReserva.CANCELADA
        ? "CANCELLED"
        : reserva.estado_reserva === EstadoReserva.CONFIRMADA
          ? "CONFIRMED"
          : "PENDING";

    return {
      success: true,
      message: "Reserva confirmada en Ecuatravel.",
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
      guia_asignado: "Por asignar",
      punto_encuentro: "Por confirmar con el operador",
      voucher_qr_payload: this.firmarVoucher(reserva),
    };
  }

  private log(event: string, correlationId: string, data: object) {
    this.logger.log(
      JSON.stringify({ event, correlation_id: correlationId, ...data }),
    );
  }
}
