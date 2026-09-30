import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import { Atraccion } from './entities/atraccion.entity';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { Operator } from './entities/operator.entity';
import { Category } from './entities/category.entity';
import { Badge } from './entities/badge.entity';
import { Language } from './entities/language.entity';
import { AtraccionLocation } from './entities/atraccion-location.entity';
import { AtraccionPhoto } from './entities/atraccion-photo.entity';
import { AtraccionInclude } from './entities/atraccion-include.entity';
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
    @InjectRepository(Operator)
    private readonly operatorRepository: Repository<Operator>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Badge)
    private readonly badgeRepository: Repository<Badge>,
    @InjectRepository(Language)
    private readonly languageRepository: Repository<Language>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  CATÁLOGO — Búsqueda
  // ═══════════════════════════════════════════════════════════════════════════

  async search(searchDto: SearchAtraccionesDto) {
    const qb = this.atraccionRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.operator', 'op')
      .leftJoinAndSelect('a.locations', 'loc')
      .leftJoinAndSelect('a.photos', 'ph')
      .leftJoinAndSelect('a.includes', 'inc')
      .leftJoinAndSelect('a.categories', 'cat')
      .leftJoinAndSelect('a.badges', 'badge')
      .leftJoinAndSelect('a.supported_languages', 'lang')
      .where('a.deleted_at IS NULL');

    if (searchDto.countries?.length) {
      qb.andWhere('loc.country IN (:...countries)', {
        countries: searchDto.countries,
      });
    }

    if (searchDto.filters?.rating?.minimum_review_score) {
      qb.andWhere('a.rating_score >= :minScore', {
        minScore: searchDto.filters.rating.minimum_review_score,
      });
    }

    if (searchDto.filters?.rating?.minimum_review_count) {
      qb.andWhere('a.rating_count >= :minCount', {
        minCount: searchDto.filters.rating.minimum_review_count,
      });
    }

    if (searchDto.sort?.by) {
      switch (searchDto.sort.by) {
        case 'price_asc':
          qb.orderBy('a.price_total', 'ASC');
          break;
        case 'price_desc':
          qb.orderBy('a.price_total', 'DESC');
          break;
        case 'most_popular':
          qb.orderBy('a.rating_count', 'DESC');
          break;
        default:
          qb.orderBy('a.created_at', 'DESC');
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

    qb.take(take).skip(skip);

    const [data, totalResults] = await qb.getManyAndCount();
    const currentPage = Math.floor(skip / take) + 1;
    const nextPage =
      skip + take < totalResults
        ? Buffer.from(JSON.stringify({ page: currentPage + 1 })).toString('base64')
        : null;

    return {
      data: data.map((a) => this.toResponse(a)),
      metadata: { total_results: totalResults, next_page: nextPage },
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  CATÁLOGO — CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async create(createDto: CreateAtraccionDto) {
    const operator = await this.findOrCreateOperator(createDto.operator);

    const existing = await this.atraccionRepository.findOne({
      where: { name: createDto.name, operator_id: operator.id },
    });
    if (existing) {
      throw new ConflictException({
        type: 'https://api.booking-hub.com/errors/conflict',
        title: 'Atracción duplicada',
        status: 409,
        detail: `Ya existe una atracción "${createDto.name}" registrada por el operador "${operator.name}"`,
        instance: '/api/v1/atracciones',
      });
    }

    const categories = await this.findOrCreateCategories(createDto.categories);
    const badges = await this.findOrCreateBadges(createDto.badges || []);
    const languages = await this.findOrCreateLanguages(createDto.supported_languages);

    const atraccion = this.atraccionRepository.create({
      name: createDto.name,
      long_description: createDto.long_description,
      duration: createDto.duration,
      price_currency: createDto.price.currency,
      price_total: createDto.price.total,
      operator,
      operator_id: operator.id,
      product_type: createDto.product_type as any,
      free_cancellation: createDto.free_cancellation,
      categories,
      badges,
      supported_languages: languages,
      locations: createDto.locations.map((loc) => {
        const entity = new AtraccionLocation();
        entity.address = loc.address;
        entity.city = loc.city;
        entity.country = loc.country;
        entity.latitude = loc.coordinates.latitude;
        entity.longitude = loc.coordinates.longitude;
        entity.type = loc.type;
        return entity;
      }),
      photos: createDto.photos.map((p, index) => {
        const entity = new AtraccionPhoto();
        entity.url = p.url;
        entity.display_order = index;
        return entity;
      }),
      includes: createDto.includes.map((desc) => {
        const entity = new AtraccionInclude();
        entity.description = desc;
        return entity;
      }),
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

    const operator = await this.findOrCreateOperator(dto.operator);

    if (dto.name !== exists.name || operator.id !== exists.operator_id) {
      const nameConflict = await this.atraccionRepository.findOne({
        where: { name: dto.name, operator_id: operator.id },
      });
      if (nameConflict && nameConflict.id !== id) {
        throw new ConflictException({
          type: 'https://api.booking-hub.com/errors/conflict',
          title: 'Atracción duplicada',
          status: 409,
          detail: `Ya existe una atracción "${dto.name}" registrada por el operador "${operator.name}"`,
          instance: `/api/v1/atracciones/${id}`,
        });
      }
    }

    const manager = this.atraccionRepository.manager;
    await manager.delete(AtraccionLocation, { atraccion_id: id });
    await manager.delete(AtraccionPhoto, { atraccion_id: id });
    await manager.delete(AtraccionInclude, { atraccion_id: id });

    const categories = await this.findOrCreateCategories(dto.categories);
    const badges = await this.findOrCreateBadges(dto.badges || []);
    const languages = await this.findOrCreateLanguages(dto.supported_languages);

    exists.name = dto.name;
    exists.long_description = dto.long_description;
    exists.duration = dto.duration;
    exists.price_currency = dto.price.currency;
    exists.price_total = dto.price.total;
    exists.operator = operator;
    exists.operator_id = operator.id;
    exists.product_type = dto.product_type as any;
    exists.free_cancellation = dto.free_cancellation;
    exists.categories = categories;
    exists.badges = badges;
    exists.supported_languages = languages;

    exists.locations = dto.locations.map((loc) => {
      const entity = new AtraccionLocation();
      entity.atraccion_id = id;
      entity.address = loc.address;
      entity.city = loc.city;
      entity.country = loc.country;
      entity.latitude = loc.coordinates.latitude;
      entity.longitude = loc.coordinates.longitude;
      entity.type = loc.type;
      return entity;
    });

    exists.photos = dto.photos.map((p, index) => {
      const entity = new AtraccionPhoto();
      entity.atraccion_id = id;
      entity.url = p.url;
      entity.display_order = index;
      return entity;
    });

    exists.includes = dto.includes.map((desc) => {
      const entity = new AtraccionInclude();
      entity.atraccion_id = id;
      entity.description = desc;
      return entity;
    });

    await this.atraccionRepository.save(exists);
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

    if (dto.operator) {
      atraccion.operator = await this.findOrCreateOperator(dto.operator);
      atraccion.operator_id = atraccion.operator.id;
    }

    const checkName = dto.name || atraccion.name;
    const checkOperatorId = atraccion.operator_id;
    if (dto.name && (dto.name !== atraccion.name)) {
      const nameConflict = await this.atraccionRepository.findOne({
        where: { name: checkName, operator_id: checkOperatorId },
      });
      if (nameConflict && nameConflict.id !== id) {
        throw new ConflictException({
          type: 'https://api.booking-hub.com/errors/conflict',
          title: 'Atracción duplicada',
          status: 409,
          detail: `Ya existe una atracción "${checkName}" registrada por este operador`,
          instance: `/api/v1/atracciones/${id}`,
        });
      }
    }

    if (dto.name !== undefined) atraccion.name = dto.name;
    if (dto.long_description !== undefined) atraccion.long_description = dto.long_description;
    if (dto.duration !== undefined) atraccion.duration = dto.duration;
    if (dto.price) {
      atraccion.price_currency = dto.price.currency;
      atraccion.price_total = dto.price.total;
    }
    if (dto.product_type !== undefined) atraccion.product_type = dto.product_type as any;
    if (dto.free_cancellation !== undefined) atraccion.free_cancellation = dto.free_cancellation;

    const manager = this.atraccionRepository.manager;

    if (dto.categories) {
      atraccion.categories = await this.findOrCreateCategories(dto.categories);
    }
    if (dto.badges) {
      atraccion.badges = await this.findOrCreateBadges(dto.badges);
    }
    if (dto.supported_languages) {
      atraccion.supported_languages = await this.findOrCreateLanguages(dto.supported_languages);
    }

    if (dto.locations) {
      await manager.delete(AtraccionLocation, { atraccion_id: id });
      atraccion.locations = dto.locations.map((loc) => {
        const entity = new AtraccionLocation();
        entity.atraccion_id = id;
        entity.address = loc.address;
        entity.city = loc.city;
        entity.country = loc.country;
        entity.latitude = loc.coordinates.latitude;
        entity.longitude = loc.coordinates.longitude;
        entity.type = loc.type;
        return entity;
      });
    }

    if (dto.photos) {
      await manager.delete(AtraccionPhoto, { atraccion_id: id });
      atraccion.photos = dto.photos.map((p, index) => {
        const entity = new AtraccionPhoto();
        entity.atraccion_id = id;
        entity.url = p.url;
        entity.display_order = index;
        return entity;
      });
    }

    if (dto.includes) {
      await manager.delete(AtraccionInclude, { atraccion_id: id });
      atraccion.includes = dto.includes.map((desc) => {
        const entity = new AtraccionInclude();
        entity.atraccion_id = id;
        entity.description = desc;
        return entity;
      });
    }

    const updated = await this.atraccionRepository.save(atraccion);
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  DISPONIBILIDAD
  // ═══════════════════════════════════════════════════════════════════════════

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
      .andWhere('r.status != :cancelled', {
        cancelled: ReservationStatus.CANCELLED,
      })
      .getRawOne();

    const totalCapacity = 100;
    const reserved = parseInt(reservedCount?.total || '0', 10);

    return {
      date,
      available_spots: Math.max(0, totalCapacity - reserved),
      times: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESERVAS
  // ═══════════════════════════════════════════════════════════════════════════

  async reserve(
    atraccionId: string,
    dto: ReservationRequestDto,
    idempotencyKey: string,
  ) {
    const existingReserva = await this.reservationRepository.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (existingReserva) {
      throw new ConflictException({
        type: 'https://api.booking-hub.com/errors/idempotency-conflict',
        title: 'Idempotency-Key ya fue procesada',
        status: 409,
        detail: `La reserva con Idempotency-Key "${idempotencyKey}" ya existe con ID: ${existingReserva.reservation_id}`,
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

    const totalAmount = (atraccion.price_total || 0) * dto.ticket_count;

    const reservation = this.reservationRepository.create({
      atraccion_id: atraccionId,
      status: ReservationStatus.CONFIRMED,
      date: dto.date,
      time: dto.time,
      ticket_count: dto.ticket_count,
      customer_name: dto.customer_name,
      customer_email: dto.customer_email,
      total_price_currency: atraccion.price_currency || 'USD',
      total_price_total: totalAmount,
      idempotency_key: idempotencyKey,
    });

    const saved = await this.reservationRepository.save(reservation);
    return this.toReservationResponse(saved);
  }

  async cancelReservation(
    reservationId: string,
    dto: CancelReservationRequestDto,
    idempotencyKey: string,
  ) {
    const existingKey = await this.reservationRepository.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (existingKey && existingKey.reservation_id !== reservationId) {
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
      return this.toReservationResponse(reservation);
    }

    reservation.status = ReservationStatus.CANCELLED;
    reservation.cancel_reason = dto.reason;

    const saved = await this.reservationRepository.save(reservation);
    return this.toReservationResponse(saved);
  }

  async getReservations() {
    const reservations = await this.reservationRepository.find({
      order: { created_at: 'DESC' },
    });
    return reservations.map((r) => this.toReservationResponse(r));
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

    return this.toReservationResponse(reservation);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS — Find or Create (Catálogos normalizados)
  // ═══════════════════════════════════════════════════════════════════════════

  private async findOrCreateOperator(
    dto: { id: number; name: string },
  ): Promise<Operator> {
    let operator = await this.operatorRepository.findOne({
      where: { id: dto.id },
    });
    if (!operator) {
      operator = this.operatorRepository.create({
        id: dto.id,
        name: dto.name,
      });
      await this.operatorRepository.save(operator);
    }
    return operator;
  }

  private async findOrCreateCategories(names: string[]): Promise<Category[]> {
    const categories: Category[] = [];
    for (const name of names) {
      let cat = await this.categoryRepository.findOne({ where: { name } });
      if (!cat) {
        cat = this.categoryRepository.create({ name });
        await this.categoryRepository.save(cat);
      }
      categories.push(cat);
    }
    return categories;
  }

  private async findOrCreateBadges(names: string[]): Promise<Badge[]> {
    const badges: Badge[] = [];
    for (const name of names) {
      let badge = await this.badgeRepository.findOne({ where: { name } });
      if (!badge) {
        badge = this.badgeRepository.create({ name });
        await this.badgeRepository.save(badge);
      }
      badges.push(badge);
    }
    return badges;
  }

  private async findOrCreateLanguages(codes: string[]): Promise<Language[]> {
    const languages: Language[] = [];
    for (const code of codes) {
      let lang = await this.languageRepository.findOne({ where: { code } });
      if (!lang) {
        lang = this.languageRepository.create({ code });
        await this.languageRepository.save(lang);
      }
      languages.push(lang);
    }
    return languages;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MAPPERS — Reconstruyen la estructura del contrato OpenAPI
  // ═══════════════════════════════════════════════════════════════════════════

  private toResponse(atraccion: Atraccion) {
    return {
      id: atraccion.id,
      name: atraccion.name,
      long_description: atraccion.long_description,
      duration: atraccion.duration,
      price: {
        currency: atraccion.price_currency,
        total: atraccion.price_total,
      },
      categories: atraccion.categories?.map((c) => c.name) || [],
      badges: atraccion.badges?.map((b) => b.name) || [],
      locations:
        atraccion.locations?.map((loc) => ({
          address: loc.address,
          city: loc.city,
          country: loc.country,
          coordinates: {
            latitude: loc.latitude,
            longitude: loc.longitude,
          },
          type: loc.type,
        })) || [],
      photos: atraccion.photos?.map((p) => ({ url: p.url })) || [],
      operator: atraccion.operator
        ? { id: atraccion.operator.id, name: atraccion.operator.name }
        : null,
      product_type: atraccion.product_type,
      includes: atraccion.includes?.map((inc) => inc.description) || [],
      supported_languages:
        atraccion.supported_languages?.map((l) => l.code) || [],
      free_cancellation: atraccion.free_cancellation,
      ratings:
        atraccion.rating_score != null
          ? {
              number_of_reviews: atraccion.rating_count,
              score: atraccion.rating_score,
            }
          : null,
      url: atraccion.url_web
        ? { web: atraccion.url_web, app: atraccion.url_app }
        : null,
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

  private toReservationResponse(reservation: Reservation) {
    return {
      reservation_id: reservation.reservation_id,
      status: reservation.status,
      ticket_count: reservation.ticket_count,
      total_price: {
        currency: reservation.total_price_currency,
        total: reservation.total_price_total,
      },
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}
