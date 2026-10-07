import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { Atraccion } from "./entities/atraccion.entity";
import { Reserva, EstadoReserva } from "./entities/reserva.entity";
import { DetalleReserva } from "./entities/detalle-reserva.entity";
import { Cliente } from "./entities/cliente.entity";
import { Factura, EstadoPago } from "./entities/factura.entity";
import { Resena } from "./entities/resena.entity";
import { Wishlist } from "./entities/wishlist.entity";
import { CreateAtraccionDto } from "./dto/create-atraccion.dto";
import { UpdateAtraccionDto } from "./dto/update-atraccion.dto";
import { SearchAtraccionesDto } from "./dto/search-atracciones.dto";
import { SearchAtraccionesResponseDto } from "./dto/search-response.dto";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { DetailsRequestDto } from "./dto/details-request.dto";
import { AvailabilityResponseDto } from "./dto/availability.dto";
import {
  ReservationRequestDto,
  ReservationResponseDto,
  CancelReservationRequestDto,
  ReservationStatus,
} from "./dto/reservation.dto";

const BOOKABLE_STATES: EstadoReserva[] = [
  EstadoReserva.PENDIENTE,
  EstadoReserva.CONFIRMADA,
];

function statusToEnum(status: EstadoReserva): ReservationStatus {
  if (status === EstadoReserva.CONFIRMADA) return ReservationStatus.CONFIRMED;
  if (status === EstadoReserva.CANCELADA) return ReservationStatus.CANCELLED;
  return ReservationStatus.PENDING;
}

function fmtDate(value: string | Date): string {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).slice(0, 10);
}

@Injectable()
export class AtraccionesService {
  constructor(
    @InjectRepository(Atraccion)
    private atraccionRepository: Repository<Atraccion>,
    @InjectRepository(Reserva)
    private reservaRepository: Repository<Reserva>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    @InjectRepository(Resena)
    private resenaRepository: Repository<Resena>,
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(DetalleReserva)
    private detalleReservaRepository: Repository<DetalleReserva>,
  ) {}

  // ==========================================
  // CATÁLOGO — CRUD
  // ==========================================

  async create(dto: CreateAtraccionDto) {
    const atraccion = this.atraccionRepository.create(dto);
    return this.atraccionRepository.save(atraccion);
  }

  async findAll(query: PaginationQueryDto) {
    const page = query.page || 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.atraccionRepository.createQueryBuilder("a");

    if (query.q?.trim()) {
      const like = `%${query.q.trim()}%`;
      qb.andWhere(
        "(a.nombre ILIKE :q OR a.descripcion ILIKE :q OR a.codigo_aeropuerto ILIKE :q)",
        { q: like },
      );
    }

    if (query.aeropuerto?.trim()) {
      qb.andWhere("a.codigo_aeropuerto = :apt", {
        apt: query.aeropuerto.trim().toUpperCase(),
      });
    }

    const [items, total] = await qb
      .orderBy("a.nombre", "ASC")
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async findOne(id: string) {
    const atraccion = await this.atraccionRepository.findOne({ where: { id } });
    if (!atraccion) throw new NotFoundException("Atraccion no encontrada");
    return atraccion;
  }

  async replace(id: string, dto: CreateAtraccionDto) {
    const atraccion = await this.findOne(id);
    Object.assign(atraccion, dto);
    await this.atraccionRepository.save(atraccion);
  }

  async update(id: string, dto: UpdateAtraccionDto) {
    const atraccion = await this.findOne(id);
    Object.assign(atraccion, dto);
    return this.atraccionRepository.save(atraccion);
  }

  async remove(id: string) {
    const atraccion = await this.findOne(id);
    await this.atraccionRepository.remove(atraccion);
  }

  async search(
    dto: SearchAtraccionesDto,
  ): Promise<SearchAtraccionesResponseDto> {
    const rows = dto.rows || 20;
    const [items, total] = await this.atraccionRepository.findAndCount({
      take: rows,
    });
    return {
      data: items as any,
      metadata: { total_results: total, next_page: null },
      request_id: randomUUID(),
    };
  }

  async getDetailsBatch(dto: DetailsRequestDto) {
    const items = await this.atraccionRepository.findByIds(
      dto.attractions || [],
    );
    return {
      data: items as any,
      metadata: { total_results: items.length, next_page: null },
      request_id: randomUUID(),
    };
  }

  // ==========================================
  // DISPONIBILIDAD (REAL)
  // ==========================================

  private async bookedForDate(id: string, date: string): Promise<number> {
    const { sum } = await this.detalleReservaRepository
      .createQueryBuilder("d")
      .innerJoin("d.reserva", "r")
      .select("COALESCE(SUM(d.cantidad_boletos), 0)", "sum")
      .where("d.atraccion_id = :id", { id })
      .andWhere("r.fecha_reserva = :date", { date })
      .andWhere("r.estado_reserva IN (:...estados)", {
        estados: BOOKABLE_STATES,
      })
      .getRawOne();
    return Number(sum ?? 0);
  }

  async getAvailability(
    id: string,
    date: string,
  ): Promise<AvailabilityResponseDto> {
    const atraccion = await this.findOne(id);
    if (atraccion.estado && atraccion.estado !== "ACTIVA") {
      return { date, available_spots: 0, times: [] };
    }
    const booked = await this.bookedForDate(id, date);
    return {
      date,
      available_spots: Math.max(atraccion.capacidad_diaria - booked, 0),
      times: ["09:00", "14:00"],
    };
  }

  // ==========================================
  // RESERVAS (TRANSACCIONAL + IDEMPOTENTE)
  // ==========================================

  private toReservationResponse(reserva: Reserva): ReservationResponseDto {
    const detalle = reserva.detalles?.[0];
    return {
      reservation_id: reserva.id,
      status: statusToEnum(reserva.estado_reserva),
      ticket_count: detalle?.cantidad_boletos ?? 0,
      total_price: {
        currency: "USD",
        total: Number(detalle?.subtotal ?? 0),
      },
      atraccion_id: detalle?.atraccion?.id ?? null,
      date: fmtDate(reserva.fecha_reserva),
      customer_name: reserva.cliente?.nombre_completo,
    };
  }

  async reserve(
    id: string,
    usuarioId: string,
    idempotencyKey: string,
    dto: ReservationRequestDto,
  ): Promise<ReservationResponseDto> {
    const connection = this.reservaRepository.manager.connection;
    const queryRunner = connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Idempotencia: si la clave ya se usó, se devuelve la reserva original.
      if (idempotencyKey) {
        const existing = await queryRunner.manager.findOne(Reserva, {
          where: { idempotency_key: idempotencyKey },
          relations: ["detalles", "detalles.atraccion", "cliente"],
        });
        if (existing) {
          await queryRunner.commitTransaction();
          return this.toReservationResponse(existing);
        }
      }

      const atraccion = await queryRunner.manager.findOne(Atraccion, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!atraccion) throw new NotFoundException("Atraccion no encontrada");
      if (atraccion.estado && atraccion.estado !== "ACTIVA") {
        throw new ConflictException(
          `La atracción está en estado ${atraccion.estado}`,
        );
      }

      const cliente = await queryRunner.manager.findOne(Cliente, {
        where: { usuario: { id: usuarioId } },
      });
      if (!cliente)
        throw new NotFoundException(
          "Cliente no encontrado o no asociado al usuario",
        );

      const booked = await this.bookedForDateTx(
        queryRunner.manager,
        id,
        dto.date,
      );
      const remaining = atraccion.capacidad_diaria - booked;
      if (dto.ticket_count > remaining) {
        throw new ConflictException(
          `No hay cupos suficientes para ${dto.date}: quedan ${Math.max(remaining, 0)} de ${atraccion.capacidad_diaria}`,
        );
      }

      const reserva = this.reservaRepository.create({
        fecha_reserva: dto.date,
        estado_reserva: EstadoReserva.PENDIENTE,
        cliente,
        idempotency_key: idempotencyKey || null,
      });
      await queryRunner.manager.save(reserva);

      const total =
        Math.round(atraccion.precio_base * dto.ticket_count * 100) / 100;
      const detalle = this.detalleReservaRepository.create({
        reserva,
        atraccion,
        cantidad_boletos: dto.ticket_count,
        precio_unitario_historico: atraccion.precio_base,
        subtotal: total,
      });
      await queryRunner.manager.save(detalle);

      const factura = this.facturaRepository.create({
        numero_factura: `FAC-${randomUUID()}`,
        fecha_emision: new Date().toISOString().split("T")[0],
        ruc_cliente: cliente.dni ?? "9999999999999",
        estado_pago: EstadoPago.PENDIENTE,
        total_pagado: total,
        reserva,
        cliente,
      });
      await queryRunner.manager.save(factura);

      await queryRunner.commitTransaction();

      return {
        reservation_id: reserva.id,
        status: ReservationStatus.PENDING,
        ticket_count: dto.ticket_count,
        total_price: { currency: "USD", total },
        atraccion_id: id,
        date: dto.date,
        customer_name: dto.customer_name,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      if (String(err?.code) === "23505") {
        throw new ConflictException(
          "La clave de idempotencia ya fue utilizada",
        );
      }
      throw new BadRequestException(
        err?.message || "Error desconocido al reservar",
      );
    } finally {
      await queryRunner.release();
    }
  }

  private bookedForDateTx(manager, id: string, date: string): Promise<number> {
    return manager
      .createQueryBuilder(DetalleReserva, "d")
      .innerJoin("d.reserva", "r")
      .select("COALESCE(SUM(d.cantidad_boletos), 0)", "sum")
      .where("d.atraccion_id = :id", { id })
      .andWhere("r.fecha_reserva = :date", { date })
      .andWhere("r.estado_reserva IN (:...estados)", {
        estados: BOOKABLE_STATES,
      })
      .getRawOne()
      .then((row) => Number(row?.sum ?? 0));
  }

  async getReservations(usuarioId: string) {
    const items = await this.reservaRepository.find({
      where: { cliente: { usuario: { id: usuarioId } } },
      relations: ["detalles", "detalles.atraccion", "cliente"],
      order: { created_at: "DESC" },
    });
    return {
      data: items.map((r) => this.toReservationResponse(r)),
      meta: { totalItems: items.length },
    };
  }

async getReservationById(id: string, usuarioId: string) {
    const reserva = await this.reservaRepository.findOne({
      where: { id },
      relations: ['detalles', 'detalles.atraccion', 'cliente', 'cliente.usuario'],
    });
    if (!reserva) throw new NotFoundException("Reserva no encontrada");
    if (reserva.cliente?.usuario?.id !== usuarioId) {
      throw new ForbiddenException(
        "No puedes acceder a una reserva que no es tuya",
      );
    }
    return this.toReservationResponse(reserva);
  }

  async cancelReservation(
    reservationId: string,
    dto: CancelReservationRequestDto,
    idempotencyKey: string,
    usuarioId: string,
  ) {
    const reserva = await this.reservaRepository.findOne({
      where: { id: reservationId },
      relations: [
        "detalles",
        "detalles.atraccion",
        "cliente",
        "cliente.usuario",
      ],
    });
    if (!reserva) throw new NotFoundException("Reserva no encontrada");
    if (reserva.cliente?.usuario?.id !== usuarioId) {
      throw new ForbiddenException(
        "No puedes cancelar una reserva que no es tuya",
      );
    }
    if (reserva.estado_reserva !== EstadoReserva.CANCELADA) {
      reserva.estado_reserva = EstadoReserva.CANCELADA;
      await this.reservaRepository.save(reserva);
    }
    return this.toReservationResponse(reserva);
  }

  // ==========================================
  // RESEÑAS
  // ==========================================

  async createReview(
    atraccionId: string,
    usuarioId: string,
    score: number,
    comment: string,
  ) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id: atraccionId },
    });
    if (!atraccion) throw new NotFoundException("Atracción no encontrada");

    const cliente = await this.clienteRepository.findOne({
      where: { usuario: { id: usuarioId } },
    });
    if (!cliente)
      throw new NotFoundException(
        "Cliente no encontrado o no asociado al usuario",
      );

    const resena = this.resenaRepository.create({
      score,
      comment,
      atraccion,
      cliente,
    });
    await this.resenaRepository.save(resena);

    return {
      message: "Reseña creada exitosamente",
      id: resena.id,
      score: resena.score,
      comment: resena.comment,
    };
  }

  async getReviews(atraccionId: string) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id: atraccionId },
    });
    if (!atraccion) throw new NotFoundException("Atracción no encontrada");

    const resenas = await this.resenaRepository.find({
      where: { atraccion: { id: atraccionId } },
      order: { created_at: "DESC" },
      relations: ["cliente"],
    });

    return {
      data: resenas.map((r) => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        created_at: r.created_at,
        cliente: r.cliente ? r.cliente.nombre_completo : "Usuario anónimo",
      })),
    };
  }

  // ==========================================
  // FOTOS
  // ==========================================

  async updatePhoto(atraccionId: string, fotoUrl: string) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id: atraccionId },
    });
    if (!atraccion) throw new NotFoundException("Atracción no encontrada");

    atraccion.foto_url = fotoUrl;
    await this.atraccionRepository.save(atraccion);

    return {
      message: "Imagen subida y URL generada exitosamente",
      foto_url: atraccion.foto_url,
    };
  }

  // ==========================================
  // WISHLIST
  // ==========================================

  async addToWishlist(usuarioId: string, atraccionId: string) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id: atraccionId },
    });
    if (!atraccion) throw new NotFoundException("Atracción no encontrada");

    const cliente = await this.clienteRepository.findOne({
      where: { usuario: { id: usuarioId } },
    });
    if (!cliente)
      throw new NotFoundException(
        "Cliente no encontrado o no asociado al usuario",
      );

    const exists = await this.wishlistRepository.findOne({
      where: { atraccion: { id: atraccionId }, cliente: { id: cliente.id } },
    });
    if (exists)
      throw new ConflictException("La atracción ya está en tus favoritos");

    const wishlist = this.wishlistRepository.create({ atraccion, cliente });
    await this.wishlistRepository.save(wishlist);

    return { message: "Añadida a favoritos", id: wishlist.id };
  }

  async removeFromWishlist(usuarioId: string, atraccionId: string) {
    const cliente = await this.clienteRepository.findOne({
      where: { usuario: { id: usuarioId } },
    });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");

    const wishlist = await this.wishlistRepository.findOne({
      where: { atraccion: { id: atraccionId }, cliente: { id: cliente.id } },
    });
    if (!wishlist) throw new NotFoundException("No está en tus favoritos");

    await this.wishlistRepository.remove(wishlist);
  }

  async getWishlist(usuarioId: string) {
    const cliente = await this.clienteRepository.findOne({
      where: { usuario: { id: usuarioId } },
    });
    if (!cliente) throw new NotFoundException("Cliente no encontrado");

    const items = await this.wishlistRepository.find({
      where: { cliente: { id: cliente.id } },
      relations: ["atraccion"],
      order: { added_at: "DESC" },
    });

    return {
      data: items.map((w) => ({
        wishlist_id: w.id,
        added_at: w.added_at,
        atraccion_id: w.atraccion.id,
        atraccion: w.atraccion,
      })),
    };
  }

  // ==========================================
  // PAGOS (TRANSACCIONAL + IDEMPOTENTE + PROPIETARIO)
  // ==========================================

  async processPayment(
    reservationId: string,
    cardToken: string,
    method: string,
    usuarioId: string,
  ) {
    const reserva = await this.reservaRepository.findOne({
      where: { id: reservationId },
      relations: ["factura", "cliente", "cliente.usuario"],
    });
    if (!reserva) throw new NotFoundException("Reserva no encontrada");
    if (reserva.cliente?.usuario?.id !== usuarioId) {
      throw new ForbiddenException(
        "No puedes pagar una reserva que no es tuya",
      );
    }
    if (!reserva.factura)
      throw new BadRequestException("La reserva no tiene una factura generada");

    // Reintento idempotente: si ya está pagada, devolver el mismo resultado.
    if (reserva.factura.estado_pago === EstadoPago.PAGADO) {
      return {
        transaction_id: reserva.factura.transaction_id,
        status: "SUCCESS",
        receipt_url: reserva.factura.receipt_url,
      };
    }

    // Pasarela simulada: "tok_fail" fuerza rechazo (sin tocar la DB).
    const isSuccess = cardToken !== "tok_fail";
    if (!isSuccess) {
      return { transaction_id: null, status: "FAILED", receipt_url: null };
    }

    const queryRunner =
      this.reservaRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const locked = await queryRunner.manager.findOne(Reserva, {
        where: { id: reservationId },
        lock: { mode: "pessimistic_write" },
      });
      const factura =
        locked &&
        (await queryRunner.manager.findOne(Factura, {
          where: { reserva: { id: reservationId } },
        }));
      if (!locked || !factura)
        throw new BadRequestException(
          "La reserva no tiene una factura generada",
        );
      if (factura.estado_pago === EstadoPago.PAGADO) {
        await queryRunner.commitTransaction();
        return {
          transaction_id: factura.transaction_id,
          status: "SUCCESS",
          receipt_url: factura.receipt_url,
        };
      }

      const txId = "tx_" + Math.random().toString(36).substring(2, 15);
      factura.estado_pago = EstadoPago.PAGADO;
      factura.transaction_id = txId;
      factura.metodo_pago = method;
      factura.receipt_url = `https://billing.booking-hub.com/receipts/${txId}`;
      locked.estado_reserva = EstadoReserva.CONFIRMADA;

      await queryRunner.manager.save(factura);
      await queryRunner.manager.save(locked);

      await queryRunner.commitTransaction();

      return {
        transaction_id: txId,
        status: "SUCCESS",
        receipt_url: factura.receipt_url,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error("[processPayment]", error);
      throw new ConflictException(
        "Error procesando la transacción en la base de datos",
      );
    } finally {
      await queryRunner.release();
    }
  }
}
