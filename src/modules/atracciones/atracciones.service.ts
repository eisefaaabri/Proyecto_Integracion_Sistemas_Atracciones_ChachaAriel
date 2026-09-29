import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Atraccion } from './entities/atraccion.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationStatus } from './entities/reservation.entity';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAtraccionesDto } from './dto/search-atracciones.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { ReservationRequestDto } from './dto/reservation.dto';
import { CancelReservationRequestDto } from './dto/reservation.dto';

@Injectable()
export class AtraccionesService {
  constructor(
    @InjectRepository(Atraccion)
    private readonly atraccionRepository: Repository<Atraccion>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
  ) {}

  async search(searchDto: SearchAtraccionesDto) {
    const queryBuilder = this.atraccionRepository
      .createQueryBuilder('a')
      .where('a.deleted_at IS NULL');

    if (searchDto.countries?.length) {
      queryBuilder.andWhere(
        `EXISTS (SELECT 1 FROM jsonb_array_elements(a.locations) loc WHERE loc->>'country' = ANY(:countries))`,
        { countries: searchDto.countries },
      );
    }

    if (searchDto.filters?.rating?.minimum_review_score) {
      queryBuilder.andWhere(
        `(a.ratings->>'score')::float >= :minScore`,
        { minScore: searchDto.filters.rating.minimum_review_score },
      );
    }

    if (searchDto.filters?.rating?.minimum_review_count) {
      queryBuilder.andWhere(
        `(a.ratings->>'number_of_reviews')::int >= :minCount`,
        { minCount: searchDto.filters.rating.minimum_review_count },
      );
    }

    if (searchDto.sort?.by) {
      switch (searchDto.sort.by) {
        case 'price_asc':
          queryBuilder.orderBy(`(a.price->>'total')::float`, 'ASC');
          break;
        case 'price_desc':
          queryBuilder.orderBy(`(a.price->>'total')::float`, 'DESC');
          break;
        case 'most_popular':
          queryBuilder.orderBy(`(a.ratings->>'number_of_reviews')::int`, 'DESC');
          break;
        default:
          queryBuilder.orderBy('a.created_at', 'DESC');
      }
    }

    const take = searchDto.rows || 20;
    let skip = 0;

    if (searchDto.next_page) {
      try {
        const decoded = JSON.parse(
          Buffer.from(searchDto.next_page, 'base64').toString('utf-8'),
        );
        skip = (decoded.page - 1) * take;
      } catch {
        skip = 0;
      }
    }

    queryBuilder.take(take).skip(skip);

    const [data, totalResults] = await queryBuilder.getManyAndCount();
    const currentPage = Math.floor(skip / take) + 1;
    const nextPage =
      skip + take < totalResults
        ? Buffer.from(JSON.stringify({ page: currentPage + 1 })).toString('base64')
        : null;

    return {
      data: data.map((a) => this.toResponse(a)),
      metadata: {
        total_results: totalResults,
        next_page: nextPage,
      },
      request_id: this.generateRequestId(),
    };
  }

  async getDetailsBatch(dto: DetailsRequestDto) {
    const atracciones = await this.atraccionRepository.find({
      where: { id: In(dto.attractions) },
    });

    return {
      data: atracciones.map((a) => this.toResponse(a)),
      metadata: { total_results: atracciones.length, next_page: null },
      request_id: this.generateRequestId(),
    };
  }

  async create(createDto: CreateAtraccionDto) {
    const atraccion = this.atraccionRepository.create({
      name: createDto.name,
      long_description: createDto.long_description,
      duration: createDto.duration,
      price: createDto.price,
      categories: createDto.categories,
      badges: createDto.badges,
      locations: createDto.locations as any,
      photos: createDto.photos as any,
      operator: createDto.operator,
      product_type: createDto.product_type as any,
      includes: createDto.includes,
      supported_languages: createDto.supported_languages,
      free_cancellation: createDto.free_cancellation,
    });

    const saved = await this.atraccionRepository.save(atraccion);
    return this.toResponse(saved);
  }

  async findAll(query: PaginationQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [data, totalItems] = await this.atraccionRepository.findAndCount({
      take: limit,
      skip,
      order: { created_at: 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: data.map((a) => this.toResponse(a)),
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async findOne(id: string) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id },
    });

    if (!atraccion) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Atracción no encontrada',
        status: 404,
        detail: `No se encontró una atracción con el ID: ${id}`,
        instance: `/api/v1/atracciones/${id}`,
      });
    }

    return this.toResponse(atraccion);
  }

  async replace(id: string, dto: CreateAtraccionDto): Promise<void> {
    const exists = await this.atraccionRepository.findOne({ where: { id } });

    if (!exists) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Atracción no encontrada',
        status: 404,
        detail: `No se encontró una atracción con el ID: ${id}`,
        instance: `/api/v1/atracciones/${id}`,
      });
    }

    await this.atraccionRepository.update(id, {
      name: dto.name,
      long_description: dto.long_description,
      duration: dto.duration,
      price: dto.price,
      categories: dto.categories,
      badges: dto.badges,
      locations: dto.locations as any,
      photos: dto.photos as any,
      operator: dto.operator,
      product_type: dto.product_type as any,
      includes: dto.includes,
      supported_languages: dto.supported_languages,
      free_cancellation: dto.free_cancellation,
    });
  }

  async update(id: string, dto: UpdateAtraccionDto) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id },
    });

    if (!atraccion) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Atracción no encontrada',
        status: 404,
        detail: `No se encontró una atracción con el ID: ${id}`,
        instance: `/api/v1/atracciones/${id}`,
      });
    }

    const updateData: Partial<Atraccion> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.long_description !== undefined) updateData.long_description = dto.long_description;
    if (dto.duration !== undefined) updateData.duration = dto.duration;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.categories !== undefined) updateData.categories = dto.categories;
    if (dto.badges !== undefined) updateData.badges = dto.badges;
    if (dto.locations !== undefined) updateData.locations = dto.locations as any;
    if (dto.photos !== undefined) updateData.photos = dto.photos as any;
    if (dto.operator !== undefined) updateData.operator = dto.operator;
    if (dto.product_type !== undefined) updateData.product_type = dto.product_type as any;
    if (dto.includes !== undefined) updateData.includes = dto.includes;
    if (dto.supported_languages !== undefined) updateData.supported_languages = dto.supported_languages;
    if (dto.free_cancellation !== undefined) updateData.free_cancellation = dto.free_cancellation;

    await this.atraccionRepository.update(id, updateData);

    const updated = await this.atraccionRepository.findOne({ where: { id } });
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id },
    });

    if (!atraccion) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Atracción no encontrada',
        status: 404,
        detail: `No se encontró una atracción con el ID: ${id}`,
        instance: `/api/v1/atracciones/${id}`,
      });
    }

    await this.atraccionRepository.softRemove(atraccion);
  }

  async getAvailability(id: string, date: string) {
    const atraccion = await this.atraccionRepository.findOne({
      where: { id },
    });

    if (!atraccion) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Atracción no encontrada',
        status: 404,
        detail: `No se encontró una atracción con el ID: ${id}`,
        instance: `/api/v1/atracciones/${id}`,
      });
    }

    const reservedCount = await this.reservationRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.ticket_count), 0)', 'total')
      .where('r.atraccion_id = :id', { id })
      .andWhere('r.date = :date', { date })
      .andWhere('r.status != :cancelled', { cancelled: ReservationStatus.CANCELLED })
      .getRawOne();

    const totalCapacity = 100;
    const reserved = parseInt(reservedCount?.total || '0', 10);
    const availableSpots = Math.max(0, totalCapacity - reserved);

    return {
      date,
      available_spots: availableSpots,
      times: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
    };
  }

  async reserve(
    atraccionId: string,
    dto: ReservationRequestDto,
    idempotencyKey: string,
  ) {
    const existing = await this.reservationRepository.findOne({
      where: { idempotency_key: idempotencyKey },
    });

    if (existing) {
      throw new ConflictException({
        type: 'https://api.booking-hub.com/errors/idempotency-conflict',
        title: 'Idempotency-Key ya fue procesada',
        status: 409,
        detail: `La reserva con Idempotency-Key "${idempotencyKey}" ya existe con ID: ${existing.reservation_id}`,
        instance: `/api/v1/atracciones/${atraccionId}/reservations`,
      });
    }

    const atraccion = await this.atraccionRepository.findOne({
      where: { id: atraccionId },
    });

    if (!atraccion) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Atracción no encontrada',
        status: 404,
        detail: `No se encontró una atracción con el ID: ${atraccionId}`,
        instance: `/api/v1/atracciones/${atraccionId}/reservations`,
      });
    }

    const unitPrice = atraccion.price?.total || 0;
    const totalPrice = {
      currency: atraccion.price?.currency || 'USD',
      total: unitPrice * dto.ticket_count,
    };

    const reservation = this.reservationRepository.create({
      atraccion_id: atraccionId,
      status: ReservationStatus.CONFIRMED,
      date: dto.date,
      time: dto.time,
      ticket_count: dto.ticket_count,
      customer_name: dto.customer_name,
      customer_email: dto.customer_email,
      total_price: totalPrice,
      idempotency_key: idempotencyKey,
    });

    const saved = await this.reservationRepository.save(reservation);

    return {
      reservation_id: saved.reservation_id,
      status: saved.status,
      ticket_count: saved.ticket_count,
      total_price: saved.total_price,
    };
  }

  async cancelReservation(
    reservationId: string,
    dto: CancelReservationRequestDto,
    idempotencyKey: string,
  ) {
    const existing = await this.reservationRepository.findOne({
      where: { idempotency_key: idempotencyKey },
    });

    if (existing && existing.reservation_id !== reservationId) {
      throw new ConflictException({
        type: 'https://api.booking-hub.com/errors/idempotency-conflict',
        title: 'Idempotency-Key ya fue utilizada para otra operación',
        status: 409,
        detail: `La Idempotency-Key "${idempotencyKey}" ya fue procesada.`,
        instance: `/api/v1/atracciones/reservations/${reservationId}/cancel`,
      });
    }

    const reservation = await this.reservationRepository.findOne({
      where: { reservation_id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Reserva no encontrada',
        status: 404,
        detail: `No se encontró la reserva con ID: ${reservationId}`,
        instance: `/api/v1/atracciones/reservations/${reservationId}/cancel`,
      });
    }

    if (reservation.status === ReservationStatus.CANCELLED) {
      return {
        reservation_id: reservation.reservation_id,
        status: reservation.status,
        ticket_count: reservation.ticket_count,
        total_price: reservation.total_price,
      };
    }

    reservation.status = ReservationStatus.CANCELLED;
    reservation.cancel_reason = dto.reason;
    reservation.idempotency_key = idempotencyKey;

    const saved = await this.reservationRepository.save(reservation);

    return {
      reservation_id: saved.reservation_id,
      status: saved.status,
      ticket_count: saved.ticket_count,
      total_price: saved.total_price,
    };
  }

  async getReservations() {
    const reservations = await this.reservationRepository.find({
      order: { created_at: 'DESC' },
    });

    return reservations.map((r) => ({
      reservation_id: r.reservation_id,
      status: r.status,
      ticket_count: r.ticket_count,
      total_price: r.total_price,
    }));
  }

  async getReservationById(reservationId: string) {
    const reservation = await this.reservationRepository.findOne({
      where: { reservation_id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException({
        type: 'https://api.booking-hub.com/errors/not-found',
        title: 'Reserva no encontrada',
        status: 404,
        detail: `No se encontró la reserva con ID: ${reservationId}`,
        instance: `/api/v1/atracciones/reservations/${reservationId}`,
      });
    }

    return {
      reservation_id: reservation.reservation_id,
      status: reservation.status,
      ticket_count: reservation.ticket_count,
      total_price: reservation.total_price,
    };
  }

  private toResponse(atraccion: Atraccion) {
    return {
      id: atraccion.id,
      name: atraccion.name,
      long_description: atraccion.long_description,
      duration: atraccion.duration,
      price: atraccion.price,
      categories: atraccion.categories,
      badges: atraccion.badges,
      locations: atraccion.locations,
      photos: atraccion.photos,
      operator: atraccion.operator,
      product_type: atraccion.product_type,
      includes: atraccion.includes,
      supported_languages: atraccion.supported_languages,
      free_cancellation: atraccion.free_cancellation,
      ratings: atraccion.ratings,
      url: atraccion.url,
      _links: {
        self: {
          href: `/api/v1/atracciones/${atraccion.id}`,
          method: 'GET',
        },
        actualizar: {
          href: `/api/v1/atracciones/${atraccion.id}`,
          method: 'PATCH',
        },
        eliminar: {
          href: `/api/v1/atracciones/${atraccion.id}`,
          method: 'DELETE',
        },
        availability: {
          href: `/api/v1/atracciones/${atraccion.id}/availability`,
          method: 'GET',
        },
        reservar: {
          href: `/api/v1/atracciones/${atraccion.id}/reservations`,
          method: 'POST',
        },
      },
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}
