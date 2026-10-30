import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { randomUUID } from "crypto";
import { Atraccion, EstadoAtraccion } from "../catalog/catalog.entities";
import { CatalogService, DatosAtraccion } from "../catalog/catalog.service";
import { LocationService } from "../location/location.service";
import { PricingService } from "../pricing/pricing.service";
import { InventoryService } from "../inventory/inventory.service";
import { OrderService, hashSolicitud } from "../order/order.service";
import { CanalOrden } from "../order/order.entities";
import { BookingService } from "../booking/booking.service";
import { CodigoEstadoReserva } from "../booking/booking.entities";
import { IdentityService, nombreCompleto } from "../identity/identity.service";
import { Usuario } from "../identity/identity.entities";
import {
  BillingProfileService,
  CONSUMIDOR_FINAL,
} from "../billing-profile/billing-profile.service";
import { ReviewService } from "../review/review.service";
import { PaymentService } from "../payment/payment.service";
import { CreateAtraccionDto } from "./dto/create-atraccion.dto";
import { UpdateAtraccionDto } from "./dto/update-atraccion.dto";
import { SearchAtraccionesDto } from "./dto/search-atracciones.dto";
import { SearchAtraccionesResponseDto } from "./dto/search-response.dto";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { DetailsRequestDto } from "./dto/details-request.dto";
import { AvailabilityResponseDto } from "./dto/availability.dto";
import {
  CancelReservationRequestDto,
  ReservationRequestDto,
  ReservationResponseDto,
  ReservationStatus,
} from "./dto/reservation.dto";
import {
  AtraccionApi,
  estadoModelo,
  toAtraccionApi,
} from "./mappers/atraccion.mapper";
import { DisponibilidadAppService } from "./disponibilidad-app.service";
import {
  ReservaUsadaError,
  ReservasAppService,
  SinCupoError,
  VistaReserva,
} from "./reservas-app.service";
import { UUID_REGEX, toHora24 } from "./booking.utils";

const ESTADOS_RESERVABLES = [
  EstadoAtraccion.PUBLICADA,
  EstadoAtraccion.BORRADOR,
];

function statusV2(estado: CodigoEstadoReserva): ReservationStatus {
  if (estado === CodigoEstadoReserva.CANCELADA)
    return ReservationStatus.CANCELLED;
  if (estado === CodigoEstadoReserva.PENDIENTE_PAGO)
    return ReservationStatus.PENDING;
  return ReservationStatus.CONFIRMED;
}

@Injectable()
export class AtraccionesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly location: LocationService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly orders: OrderService,
    private readonly bookings: BookingService,
    private readonly identity: IdentityService,
    private readonly billing: BillingProfileService,
    private readonly reviews: ReviewService,
    private readonly payments: PaymentService,
    private readonly reservas: ReservasAppService,
    private readonly disponibilidad: DisponibilidadAppService,
  ) {}

  // ==========================================
  // CATÁLOGO — CRUD
  // ==========================================

  private async aApi(atracciones: Atraccion[]): Promise<AtraccionApi[]> {
    const ids = atracciones.map((a) => a.atr_id);
    const [precios, horarios, ciudades] = await Promise.all([
      this.pricing.vigentes(ids),
      this.inventory.horariosActivos(ids),
      this.location.nombresCiudad(atracciones.map((a) => a.ciu_id)),
    ]);
    return atracciones.map((a) =>
      toAtraccionApi(a, {
        precios: precios.get(a.atr_id),
        horarios: horarios.get(a.atr_id),
        ciudad: ciudades.get(a.ciu_id),
      }),
    );
  }

  private async atraccionOFallo(id: string): Promise<Atraccion> {
    const atr = UUID_REGEX.test(id) ? await this.catalog.findByUuid(id) : null;
    if (!atr) throw new NotFoundException("Atraccion no encontrada");
    return atr;
  }

  private async datosDesdeDto(
    dto: Partial<CreateAtraccionDto>,
  ): Promise<Partial<DatosAtraccion>> {
    const datos: Partial<DatosAtraccion> = {};
    if (dto.nombre !== undefined) datos.nombre = dto.nombre;
    if (dto.descripcion !== undefined) datos.descripcion = dto.descripcion;
    if (dto.estado !== undefined) datos.estado = estadoModelo(dto.estado);
    if (dto.duracion_horas !== undefined)
      datos.duracionHoras = dto.duracion_horas;
    if (dto.itinerario !== undefined) datos.itinerario = dto.itinerario;
    if (dto.foto_url !== undefined) datos.fotoUrl = dto.foto_url || null;
    if (dto.incluye !== undefined) datos.incluye = dto.incluye;
    if (dto.codigo_aeropuerto !== undefined) {
      const aer = await this.location.aeropuerto(dto.codigo_aeropuerto);
      if (!aer) {
        throw new BadRequestException(
          `El aeropuerto '${dto.codigo_aeropuerto}' no está registrado en Ecuatravel`,
        );
      }
      datos.codigoAeropuerto = aer.aer_codigo;
      datos.ciuId = aer.ciu_id;
      datos.latitud = aer.aer_latitud;
      datos.longitud = aer.aer_longitud;
    }
    return datos;
  }

  async create(dto: CreateAtraccionDto) {
    const datos = await this.datosDesdeDto({ estado: "ACTIVA", ...dto });
    const atr = await this.dataSource.transaction(async (m) => {
      const creada = await this.catalog.crear(datos as DatosAtraccion, m);
      await this.pricing.fijarPrecioBase(creada.atr_id, dto.precio_base, m);
      await this.inventory.crearHorarios(
        creada.atr_id,
        dto.capacidad_diaria,
        m,
      );
      return creada;
    });
    void this.disponibilidad.sincronizarAtraccion(atr.atr_uuid);
    return (await this.aApi([await this.catalog.findByUuid(atr.atr_uuid)]))[0];
  }

  async findAll(query: PaginationQueryDto) {
    const page = query.page || 1;
    const limit = query.limit ?? 10;
    const [items, total] = await this.catalog.listar({
      q: query.q,
      aeropuerto: query.aeropuerto,
      page,
      limit,
    });
    return {
      data: await this.aApi(items),
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
    return (await this.aApi([await this.atraccionOFallo(id)]))[0];
  }

  private async actualizar(id: string, dto: Partial<CreateAtraccionDto>) {
    const atr = await this.atraccionOFallo(id);
    const datos = await this.datosDesdeDto(dto);
    await this.dataSource.transaction(async (m) => {
      await this.catalog.actualizar(atr, datos, m);
      if (dto.precio_base !== undefined)
        await this.pricing.fijarPrecioBase(atr.atr_id, dto.precio_base, m);
      if (dto.capacidad_diaria !== undefined)
        await this.inventory.actualizarCupo(
          atr.atr_id,
          dto.capacidad_diaria,
          m,
        );
    });
    void this.disponibilidad.sincronizarAtraccion(atr.atr_uuid);
    return this.findOne(id);
  }

  async replace(id: string, dto: CreateAtraccionDto) {
    await this.actualizar(id, {
      foto_url: null,
      incluye: null,
      duracion_horas: null,
      itinerario: null,
      estado: "ACTIVA",
      ...dto,
    });
  }

  update(id: string, dto: UpdateAtraccionDto) {
    return this.actualizar(id, dto);
  }

  async remove(id: string) {
    const atr = await this.atraccionOFallo(id);
    await this.catalog.eliminar(atr.atr_id);
  }

  async search(
    dto: SearchAtraccionesDto,
  ): Promise<SearchAtraccionesResponseDto> {
    const [items, total] = await this.catalog.listar({
      page: 1,
      limit: dto.rows || 20,
    });
    return {
      data: (await this.aApi(items)) as any,
      metadata: { total_results: total, next_page: null },
      request_id: randomUUID(),
    };
  }

  async getDetailsBatch(dto: DetailsRequestDto) {
    const uuids = (dto.attractions || []).filter((id) => UUID_REGEX.test(id));
    const items = await this.catalog.findByUuids(uuids);
    return {
      data: (await this.aApi(items)) as any,
      metadata: { total_results: items.length, next_page: null },
      request_id: randomUUID(),
    };
  }

  // ==========================================
  // DISPONIBILIDAD
  // ==========================================

  // Cupo por turno: available_spots es lo máximo que admite una sola reserva.
  async getAvailability(
    id: string,
    date: string,
  ): Promise<AvailabilityResponseDto> {
    const atr = await this.atraccionOFallo(id);
    const turnos = await this.inventory.cuposDelDia(atr.atr_id, date);
    if (!ESTADOS_RESERVABLES.includes(atr.atr_estado)) {
      return { date, available_spots: 0, times: [], slots: [] };
    }
    const slots = turnos.map((t) => ({
      time: t.hora,
      available_spots: t.cerrada ? 0 : Math.max(t.total - t.reservado, 0),
    }));
    return {
      date,
      available_spots: Math.max(0, ...slots.map((s) => s.available_spots)),
      times: slots.map((s) => s.time),
      slots,
    };
  }

  // ==========================================
  // RESERVAS WEB (TRANSACCIONAL + IDEMPOTENTE)
  // ==========================================

  private aRespuesta(
    v: VistaReserva,
    nombreCliente?: string,
  ): ReservationResponseDto {
    return {
      reservation_id: v.reserva.res_uuid,
      status: statusV2(v.estado),
      ticket_count: v.reserva.res_numero_tickets,
      total_price: { currency: "USD", total: v.reserva.res_subtotal },
      atraccion_id: v.atraccion?.atr_uuid ?? null,
      date: v.turno?.fecha,
      time: v.turno?.hora,
      customer_name:
        nombreCliente ?? this.bookings.titular(v.reserva)?.pax_nombre,
    };
  }

  private async usuarioOFallo(
    usuarioId: string,
    manager?: EntityManager,
  ): Promise<Usuario> {
    const usuario = await this.identity.findByUuid(usuarioId, manager);
    if (!usuario)
      throw new NotFoundException(
        "Cliente no encontrado o no asociado al usuario",
      );
    return usuario;
  }

  async reserve(
    id: string,
    usuarioId: string,
    idempotencyKey: string,
    dto: ReservationRequestDto,
  ): Promise<ReservationResponseDto> {
    const fecha = dto.date.slice(0, 10);
    let atrUuid: string | null = null;
    try {
      const resultado = await this.dataSource.transaction(async (m) => {
        const usuario = await this.usuarioOFallo(usuarioId, m);
        const sujeto = `usu:${usuario.usu_id}`;
        // Idempotencia: si la clave ya se usó, se devuelve la reserva original.
        if (idempotencyKey) {
          const previa = await this.orders.tomarClave(
            idempotencyKey,
            sujeto,
            "POST /atracciones/:id/reservations",
            hashSolicitud({ id, dto }),
            m,
          );
          if (previa) return { replay: previa };
        }

        const base = UUID_REGEX.test(id)
          ? await this.catalog.findByUuid(id, m)
          : null;
        const atraccion =
          base && (await this.catalog.bloquear(base.atr_id, m)) ? base : null;
        if (!atraccion) throw new NotFoundException("Atraccion no encontrada");
        if (!ESTADOS_RESERVABLES.includes(atraccion.atr_estado)) {
          throw new ConflictException(
            `La atracción está en estado ${atraccion.atr_estado}`,
          );
        }
        atrUuid = atraccion.atr_uuid;

        // Turno pedido (sin cambiarlo por otro) o, si no se indica, el primero con cupo.
        const turnos = await this.inventory.cuposDelDia(
          atraccion.atr_id,
          fecha,
          m,
        );
        const hora = dto.time ? toHora24(dto.time) : null;
        const libres = (t: (typeof turnos)[number]) =>
          t.cerrada ? 0 : t.total - t.reservado;
        if (dto.time && !turnos.some((t) => t.hora === hora)) {
          throw new BadRequestException(
            `La atracción no tiene un turno a las ${dto.time}`,
          );
        }
        const turno = turnos.find(
          (t) => (!hora || t.hora === hora) && libres(t) >= dto.ticket_count,
        );
        if (!turno && hora) {
          const elegido = turnos.find((t) => t.hora === hora);
          throw new ConflictException(
            `No hay cupos suficientes para ${fecha} a las ${hora}: quedan ${Math.max(0, libres(elegido))} de ${elegido.total}`,
          );
        }
        if (!turno) {
          const maximo = Math.max(0, ...turnos.map(libres));
          const cupo = Math.max(0, ...turnos.map((t) => t.total));
          throw new ConflictException(
            `No hay cupos suficientes para ${fecha}: quedan ${maximo} de ${cupo}`,
          );
        }

        const perfil = await this.billing.principal(usuario.usu_id, m);
        const vista = await this.reservas.crear(
          {
            atraccion,
            fecha,
            horId: turno.horId,
            pasajeros: {
              adultos: dto.ticket_count,
              ninos: 0,
              seniors: 0,
              infantes: 0,
            },
            canal: CanalOrden.WEB,
            usuId: usuario.usu_id,
            titular: {
              nombre: dto.customer_name || nombreCompleto(usuario),
              documento: usuario.usu_documento,
            },
            contacto: {
              correo: dto.customer_email ?? usuario.usu_correo,
              telefono: usuario.usu_telefono,
            },
            comprador: perfil
              ? {
                  tipoIdentificacion: perfil.dfa_tipo_identificacion,
                  identificacion: perfil.dfa_identificacion,
                  razonSocial: perfil.dfa_razon_social,
                  correo: perfil.dfa_correo,
                  telefono: perfil.dfa_telefono,
                  dfaId: perfil.dfa_id,
                }
              : {
                  tipoIdentificacion: "CONSUMIDOR_FINAL",
                  identificacion: CONSUMIDOR_FINAL,
                  razonSocial: nombreCompleto(usuario),
                  correo: usuario.usu_correo,
                  telefono: usuario.usu_telefono,
                },
          },
          m,
        );
        const respuesta = this.aRespuesta(vista, dto.customer_name);
        if (idempotencyKey) {
          await this.orders.completarClave(
            idempotencyKey,
            sujeto,
            vista.reserva.res_uuid,
            respuesta,
            m,
          );
        }
        return { respuesta };
      });

      if ("replay" in resultado) {
        if (resultado.replay.idem_response)
          return resultado.replay.idem_response as ReservationResponseDto;
        throw new ConflictException(
          "La clave de idempotencia ya fue utilizada",
        );
      }
      void this.disponibilidad.notificarStock(atrUuid, fecha);
      return resultado.respuesta;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadRequestException
      )
        throw err;
      if (err instanceof SinCupoError) {
        throw new ConflictException(
          `No hay cupos suficientes para ${fecha}: quedan ${err.disponibles} de ${err.total}`,
        );
      }
      if (String(err?.code) === "23505") {
        throw new ConflictException(
          "La clave de idempotencia ya fue utilizada",
        );
      }
      throw new BadRequestException(
        err?.message || "Error desconocido al reservar",
      );
    }
  }

  private async vistasDe(usuario: Usuario): Promise<VistaReserva[]> {
    const ordenes = await this.orders.delUsuario(usuario.usu_id);
    const reservas = await this.bookings.porOrdenes(
      ordenes.map((o) => o.ord_id),
    );
    return this.reservas.vistas(reservas);
  }

  async getReservations(usuarioId: string) {
    const usuario = await this.usuarioOFallo(usuarioId);
    const vistas = await this.vistasDe(usuario);
    return {
      data: vistas.map((v) => this.aRespuesta(v)),
      meta: { totalItems: vistas.length },
    };
  }

  private async vistaPropia(
    reservationId: string,
    usuarioId: string,
    accion: string,
    manager?: EntityManager,
  ) {
    const reserva = UUID_REGEX.test(reservationId)
      ? await this.bookings.porUuid(reservationId, manager)
      : null;
    if (!reserva) throw new NotFoundException("Reserva no encontrada");
    const vista = await this.reservas.vista(reserva, manager);
    const usuario = await this.identity.findByUuid(usuarioId, manager);
    if (!usuario || vista.orden?.usu_id !== usuario.usu_id) {
      throw new ForbiddenException(
        `No puedes ${accion} una reserva que no es tuya`,
      );
    }
    return vista;
  }

  async getReservationById(id: string, usuarioId: string) {
    return this.aRespuesta(await this.vistaPropia(id, usuarioId, "acceder a"));
  }

  async cancelReservation(
    reservationId: string,
    dto: CancelReservationRequestDto,
    _idempotencyKey: string,
    usuarioId: string,
  ) {
    let liberada: VistaReserva | null = null;
    const respuesta = await this.dataSource.transaction(async (m) => {
      const vista = await this.vistaPropia(
        reservationId,
        usuarioId,
        "cancelar",
        m,
      );
      await this.bookings.bloquear(vista.reserva.res_id, m);
      try {
        if (
          await this.reservas.cancelar(
            vista,
            { motivo: dto?.reason ?? null, solicitante: "CLIENTE" },
            m,
          )
        ) {
          liberada = vista;
        }
      } catch (err) {
        if (err instanceof ReservaUsadaError) {
          throw new ConflictException(
            "La reserva ya fue utilizada y no puede cancelarse",
          );
        }
        throw err;
      }
      return this.aRespuesta(
        await this.reservas.vista(
          await this.bookings.porId(vista.reserva.res_id, m),
          m,
        ),
      );
    });
    if (liberada)
      void this.disponibilidad.notificarStock(
        liberada.atraccion.atr_uuid,
        liberada.turno.fecha,
      );
    return respuesta;
  }

  // ==========================================
  // RESEÑAS (una por usuario y atracción)
  // ==========================================

  async createReview(
    atraccionId: string,
    usuarioId: string,
    score: number,
    comment: string,
  ) {
    const atr = UUID_REGEX.test(atraccionId)
      ? await this.catalog.findByUuid(atraccionId)
      : null;
    if (!atr) throw new NotFoundException("Atracción no encontrada");
    const usuario = await this.identity.findByUuid(usuarioId);
    if (!usuario)
      throw new NotFoundException(
        "Cliente no encontrado o no asociado al usuario",
      );

    const resena = await this.dataSource.transaction(async (m) => {
      const r = await this.reviews.publicar(
        atr.atr_id,
        usuario.usu_id,
        score,
        comment,
        m,
      );
      const { promedio, total } = await this.reviews.estadisticas(
        atr.atr_id,
        m,
      );
      await this.catalog.actualizarCalificacion(atr.atr_id, promedio, total, m);
      return r;
    });
    return {
      message: "Reseña creada exitosamente",
      id: String(resena.ren_id),
      score: resena.ren_puntuacion,
      comment: resena.ren_comentario,
    };
  }

  async getReviews(atraccionId: string) {
    const atr = UUID_REGEX.test(atraccionId)
      ? await this.catalog.findByUuid(atraccionId)
      : null;
    if (!atr) throw new NotFoundException("Atracción no encontrada");
    const resenas = await this.reviews.visibles(atr.atr_id);
    const autores = new Map<number, string>();
    for (const usuId of new Set(resenas.map((r) => r.usu_id).filter(Boolean))) {
      const u = await this.identity.findById(usuId);
      if (u) autores.set(usuId, nombreCompleto(u));
    }
    return {
      data: resenas.map((r) => ({
        id: String(r.ren_id),
        score: r.ren_puntuacion,
        comment: r.ren_comentario,
        created_at: r.ren_creado_en,
        cliente:
          (r.usu_id && autores.get(r.usu_id)) ||
          r.ren_autor_nombre ||
          "Usuario anónimo",
      })),
    };
  }

  // ==========================================
  // FOTOS
  // ==========================================

  async updatePhoto(atraccionId: string, fotoUrl: string) {
    const atr = UUID_REGEX.test(atraccionId)
      ? await this.catalog.findByUuid(atraccionId)
      : null;
    if (!atr) throw new NotFoundException("Atracción no encontrada");
    await this.dataSource.transaction((m) =>
      this.catalog.fijarFoto(atr.atr_id, atr.atr_nombre, fotoUrl, m),
    );
    return {
      message: "Imagen subida y URL generada exitosamente",
      foto_url: fotoUrl,
    };
  }

  // ==========================================
  // WISHLIST (adaptación Ecuatravel)
  // ==========================================

  async addToWishlist(usuarioId: string, atraccionId: string) {
    const atr = UUID_REGEX.test(atraccionId)
      ? await this.catalog.findByUuid(atraccionId)
      : null;
    if (!atr) throw new NotFoundException("Atracción no encontrada");
    const usuario = await this.usuarioOFallo(usuarioId);
    if (await this.catalog.favorito(usuario.usu_id, atr.atr_id)) {
      throw new ConflictException("La atracción ya está en tus favoritos");
    }
    const fav = await this.catalog.agregarFavorito(usuario.usu_id, atr.atr_id);
    return { message: "Añadida a favoritos", id: String(fav.fav_id) };
  }

  async removeFromWishlist(usuarioId: string, atraccionId: string) {
    const usuario = await this.identity.findByUuid(usuarioId);
    if (!usuario) throw new NotFoundException("Cliente no encontrado");
    const atr = UUID_REGEX.test(atraccionId)
      ? await this.catalog.findByUuid(atraccionId)
      : null;
    const fav = atr
      ? await this.catalog.favorito(usuario.usu_id, atr.atr_id)
      : null;
    if (!fav) throw new NotFoundException("No está en tus favoritos");
    await this.catalog.quitarFavorito(fav.fav_id);
  }

  async getWishlist(usuarioId: string) {
    const usuario = await this.identity.findByUuid(usuarioId);
    if (!usuario) throw new NotFoundException("Cliente no encontrado");
    const favoritos = await this.catalog.favoritosDe(usuario.usu_id);
    const atracciones = await this.aApi(favoritos.map((f) => f.atraccion));
    return {
      data: favoritos.map((f, i) => ({
        wishlist_id: String(f.fav_id),
        added_at: f.fav_creado_en,
        atraccion_id: f.atraccion.atr_uuid,
        atraccion: atracciones[i],
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
    const vista = await this.vistaPropia(reservationId, usuarioId, "pagar");
    // Reintento idempotente: si ya está pagada, devolver el mismo resultado.
    if (vista.pago) {
      return {
        transaction_id: vista.pago.pag_referencia,
        status: "SUCCESS",
        receipt_url: vista.pago.pag_comprobante_url,
      };
    }
    if (vista.estado === CodigoEstadoReserva.CANCELADA) {
      throw new ConflictException("La reserva está cancelada");
    }
    // Pasarela simulada: "tok_fail" fuerza rechazo (sin tocar la base).
    if (cardToken === "tok_fail") {
      return { transaction_id: null, status: "FAILED", receipt_url: null };
    }

    try {
      return await this.dataSource.transaction(async (m) => {
        await this.bookings.bloquear(vista.reserva.res_id, m);
        const yaPagado = await this.payments.aprobado(vista.orden.ord_id, m);
        if (yaPagado) {
          return {
            transaction_id: yaPagado.pag_referencia,
            status: "SUCCESS",
            receipt_url: yaPagado.pag_comprobante_url,
          };
        }
        const txId = "tx_" + Math.random().toString(36).substring(2, 15);
        const receiptUrl = `https://billing.booking-hub.com/receipts/${txId}`;
        await this.reservas.confirmarPago(
          vista,
          {
            metodo: this.payments.codigoMetodo(method),
            referencia: txId,
            comprobanteUrl: receiptUrl,
            metodoApi: method,
          },
          m,
        );
        return {
          transaction_id: txId,
          status: "SUCCESS",
          receipt_url: receiptUrl,
        };
      });
    } catch (error) {
      console.error("[processPayment]", error);
      throw new ConflictException(
        "Error procesando la transacción en la base de datos",
      );
    }
  }
}
