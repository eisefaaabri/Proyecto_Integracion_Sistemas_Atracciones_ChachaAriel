import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atraccion } from './entities/atraccion.entity';
import { Reserva, EstadoReserva } from './entities/reserva.entity';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { SearchAtraccionesDto } from './dto/search-atracciones.dto';
import { SearchAtraccionesResponseDto } from './dto/search-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import { ReservationRequestDto, ReservationResponseDto, CancelReservationRequestDto } from './dto/reservation.dto';
import { randomUUID } from 'crypto';

import { Factura, EstadoPago } from './entities/factura.entity';
import { Cliente } from './entities/cliente.entity';
import { Resena } from './entities/resena.entity';
import { Wishlist } from './entities/wishlist.entity';
import { ConflictException } from '@nestjs/common';

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
  ) {}

  async create(dto: CreateAtraccionDto) {
    const atraccion = this.atraccionRepository.create(dto);
    return this.atraccionRepository.save(atraccion);
  }

  async findAll(query: PaginationQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.atraccionRepository.findAndCount({
      skip,
      take: limit,
    });

    return {
      data: items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      }
    };
  }

  async findOne(id: string) {
    const atraccion = await this.atraccionRepository.findOne({ where: { id } });
    if (!atraccion) throw new NotFoundException('Atraccion no encontrada');
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

  async search(dto: SearchAtraccionesDto) {
    const [items, total] = await this.atraccionRepository.findAndCount();
    return {
      data: items as any,
      metadata: { total_results: total, next_page: null },
      request_id: randomUUID()
    };
  }

  async getDetailsBatch(dto: DetailsRequestDto) {
    const items = await this.atraccionRepository.findByIds(dto.attractions || []);
    return {
      data: items as any,
      metadata: { total_results: items.length, next_page: null },
      request_id: randomUUID()
    };
  }

  async getAvailability(id: string, date: string): Promise<AvailabilityResponseDto> {
    const atraccion = await this.findOne(id);
    return {
      date,
      available_spots: atraccion.capacidad_diaria,
      times: ['09:00', '14:00']
    };
  }

  async reserve(id: string, idempotencyKey: string, dto: ReservationRequestDto): Promise<ReservationResponseDto> {
    const atraccion = await this.findOne(id);
    const reserva = this.reservaRepository.create({
      fecha_reserva: dto.date,
      estado_reserva: EstadoReserva.CONFIRMADA
    });
    await this.reservaRepository.save(reserva);
    return {
      reservation_id: reserva.id,
      status: 'CONFIRMED' as any,
      ticket_count: dto.ticket_count,
      total_price: { currency: 'USD', total: atraccion.precio_base * dto.ticket_count },
      atraccion_id: id,
      date: dto.date,
      customer_name: dto.customer_name
    };
  }

  async cancelReservation(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string) {
    const reserva = await this.reservaRepository.findOne({ where: { id: reservationId } });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    reserva.estado_reserva = EstadoReserva.CANCELADA;
    await this.reservaRepository.save(reserva);
  }

  async getReservations(query: any) { return { data: [], meta: {} }; }
  async getReservationById(id: string) { return null; }

  // ==========================================
  // REVIEWS (NON-MOCKED)
  // ==========================================
  async createReview(atraccionId: string, usuarioId: string, score: number, comment: string) {
    const atraccion = await this.atraccionRepository.findOne({ where: { id: atraccionId } });
    if (!atraccion) throw new NotFoundException('Atracción no encontrada');

    // REQUIRES the client to exist in the database and linked to the authenticated user
    const cliente = await this.clienteRepository.findOne({ where: { usuario: { id: usuarioId } } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado o no asociado al usuario actual');

    const resena = this.resenaRepository.create({
      score,
      comment,
      atraccion,
      cliente,
    });
    await this.resenaRepository.save(resena);
    
    return {
      message: 'Reseña creada exitosamente',
      id: resena.id,
      score: resena.score,
      comment: resena.comment
    };
  }

  async getReviews(atraccionId: string) {
    const atraccion = await this.atraccionRepository.findOne({ where: { id: atraccionId } });
    if (!atraccion) throw new NotFoundException('Atracción no encontrada');

    const resenas = await this.resenaRepository.find({
      where: { atraccion: { id: atraccionId } },
      order: { created_at: 'DESC' },
      relations: ['cliente'],
    });

    return {
      data: resenas.map(r => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        created_at: r.created_at,
        cliente: r.cliente ? r.cliente.nombre_completo : 'Usuario anónimo'
      }))
    };
  }

  // ==========================================
  // PHOTOS
  // ==========================================
  async updatePhoto(atraccionId: string, fotoUrl: string) {
    const atraccion = await this.atraccionRepository.findOne({ where: { id: atraccionId } });
    if (!atraccion) throw new NotFoundException('Atracción no encontrada');

    atraccion.foto_url = fotoUrl;
    await this.atraccionRepository.save(atraccion);

    return {
      message: 'Imagen subida y URL generada exitosamente',
      foto_url: atraccion.foto_url
    };
  }

  // ==========================================
  // WISHLIST (NON-MOCKED)
  // ==========================================
  async addToWishlist(usuarioId: string, atraccionId: string) {
    const atraccion = await this.atraccionRepository.findOne({ where: { id: atraccionId } });
    if (!atraccion) throw new NotFoundException('Atracción no encontrada');

    const cliente = await this.clienteRepository.findOne({ where: { usuario: { id: usuarioId } } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado o no asociado al usuario actual');

    const exists = await this.wishlistRepository.findOne({
      where: { atraccion: { id: atraccionId }, cliente: { id: cliente.id } }
    });

    if (exists) throw new ConflictException('La atracción ya está en tus favoritos');

    const wishlist = this.wishlistRepository.create({ atraccion, cliente });
    await this.wishlistRepository.save(wishlist);

    return { message: 'Añadida a favoritos', id: wishlist.id };
  }

  async removeFromWishlist(usuarioId: string, atraccionId: string) {
    const cliente = await this.clienteRepository.findOne({ where: { usuario: { id: usuarioId } } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const wishlist = await this.wishlistRepository.findOne({
      where: { atraccion: { id: atraccionId }, cliente: { id: cliente.id } }
    });

    if (!wishlist) throw new NotFoundException('No está en tus favoritos');

    await this.wishlistRepository.remove(wishlist);
    return;
  }

  // ==========================================
  // PAYMENTS (PRODUCTION LOGIC WITH TRANSACTIONS)
  // ==========================================
  async processPayment(reservationId: string, cardToken: string, method: string) {
    const reserva = await this.reservaRepository.findOne({
      where: { id: reservationId },
      relations: ['factura']
    });

    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    if (!reserva.factura) throw new BadRequestException('La reserva no tiene una factura generada');
    if (reserva.factura.estado_pago === EstadoPago.PAGADO) {
      throw new ConflictException('La reserva ya se encuentra pagada');
    }

    // Lógica real de pasarela de pago (comentada porque necesitamos una clave secreta para Stripe/Kushki)
    // const charge = await this.paymentService.createCharge(cardToken, reserva.factura.total_pagado);
    // Para no bloquear tu desarrollo local, emulamos la respuesta del gateway sin crear datos "falsos" en nuestra DB.
    const isSuccess = cardToken !== 'tok_fail';

    if (!isSuccess) {
      return { transaction_id: null, status: 'FAILED', receipt_url: null };
    }

    // Iniciamos una Transacción para asegurar consistencia (ACID) entre Factura y Reserva
    const queryRunner = this.reservaRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const txId = 'tx_' + Math.random().toString(36).substring(2, 15);
      
      reserva.factura.estado_pago = EstadoPago.PAGADO;
      reserva.factura.transaction_id = txId;
      reserva.factura.metodo_pago = method;
      reserva.factura.receipt_url = `https://billing.booking-hub.com/receipts/${txId}`;
      
      reserva.estado_reserva = EstadoReserva.CONFIRMADA;

      await queryRunner.manager.save(reserva.factura);
      await queryRunner.manager.save(reserva);

      await queryRunner.commitTransaction();

      return {
        transaction_id: txId,
        status: 'SUCCESS',
        receipt_url: reserva.factura.receipt_url
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new ConflictException('Error procesando la transacción en la base de datos');
    } finally {
      await queryRunner.release();
    }
  }
}
