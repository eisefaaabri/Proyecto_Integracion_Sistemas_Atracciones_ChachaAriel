import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { Usuario } from "../identity/identity.entities";
import { IdentityService, nombreCompleto } from "../identity/identity.service";
import { BillingProfileService } from "../billing-profile/billing-profile.service";
import { DatoFacturacion } from "../billing-profile/billing-profile.entities";
import { Orden } from "../order/order.entities";
import { OrderService } from "../order/order.service";
import { BookingService } from "../booking/booking.service";
import { CodigoEstadoReserva, Reserva } from "../booking/booking.entities";
import { InventoryService } from "../inventory/inventory.service";
import { CatalogService } from "../catalog/catalog.service";
import { UUID_REGEX, problem } from "../atracciones/booking.utils";
import { correoParcial, evento } from "../../common/logging/evento";
import { currentCorrelationId } from "../../common/middleware/correlation-id.middleware";
import {
  ClienteResponseDto,
  ClientesAdminQueryDto,
  ClientesQueryDto,
  CreateClienteAdminDto,
  CreateClienteDto,
} from "./dto/clientes.dto";

const ACTIVAS: string[] = [
  CodigoEstadoReserva.PENDIENTE_PAGO,
  CodigoEstadoReserva.CONFIRMADA,
];

function conflicto(detail: string) {
  return problem(
    HttpStatus.CONFLICT,
    "CLIENT_CONFLICT",
    "cliente-en-conflicto",
    "Datos de cliente en conflicto",
    detail,
  );
}

function facturacion(d: DatoFacturacion | undefined) {
  return d
    ? {
        tipo_identificacion: d.dfa_tipo_identificacion,
        identificacion: d.dfa_identificacion,
        razon_social: d.dfa_razon_social,
        correo: d.dfa_correo,
        telefono: d.dfa_telefono,
      }
    : null;
}

/**
 * Módulo Clientes: turistas de Ecuatravel (rol CLIENTE en ms_identity) con su perfil
 * de facturación (ms_billing_profile) y sus reservas. La identidad es común a todo
 * el que inicia sesión; el personal (ADMIN/OPERADOR) se gestiona en el módulo Personal.
 */
@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly identity: IdentityService,
    private readonly billing: BillingProfileService,
    private readonly orders: OrderService,
    private readonly bookings: BookingService,
    private readonly inventory: InventoryService,
    private readonly catalog: CatalogService,
  ) {}

  toResponse(u: Usuario): ClienteResponseDto {
    return {
      client_id: u.usu_uuid,
      nombre: nombreCompleto(u),
      email: u.usu_correo,
      identificacion: u.usu_documento,
      telefono: u.usu_telefono,
    };
  }

  // ---------- Panel (v2) ----------

  async listar(q: ClientesAdminQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const [usuarios, total] = await this.identity.listarPorRoles(["CLIENTE"], {
      q: q.q?.trim() || null,
      skip: (page - 1) * limit,
      take: limit,
    });
    const ids = usuarios.map((u) => u.usu_id);
    const [perfiles, ordenes] = await Promise.all([
      this.billing.principales(ids),
      this.orders.porUsuarios(ids),
    ]);
    const reservas = await this.bookings.porOrdenes(
      ordenes.map((o) => o.ord_id),
    );
    const usuarioDeOrden = new Map(ordenes.map((o) => [o.ord_id, o.usu_id]));
    const conteo = new Map<number, { total: number; activas: number }>();
    for (const r of reservas) {
      const usuId = usuarioDeOrden.get(r.ord_id);
      const c = conteo.get(usuId) ?? { total: 0, activas: 0 };
      c.total += 1;
      if (ACTIVAS.includes(r.estado?.est_codigo)) c.activas += 1;
      conteo.set(usuId, c);
    }
    return {
      data: usuarios.map((u) => ({
        ...this.toResponse(u),
        activo: u.usu_activo,
        creado_en: u.usu_creado_en,
        ultimo_acceso: u.usu_ultimo_acceso,
        facturacion: facturacion(perfiles.get(u.usu_id)),
        reservas: conteo.get(u.usu_id) ?? { total: 0, activas: 0 },
      })),
      meta: {
        totalItems: total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Alta desde el panel: a diferencia de Booking, un email o documento repetido es un error. */
  async crearDesdePanel(dto: CreateClienteAdminDto, actor: string) {
    const correo = dto.email.toLowerCase();
    const documento = dto.identificacion.toUpperCase();
    const passwordHash = await bcrypt.hash(
      dto.password ?? randomBytes(32).toString("hex"),
      10,
    );
    try {
      const usuario = await this.dataSource.transaction(async (m) => {
        const existentes = await this.identity.buscarPorCorreoODocumento(
          correo,
          documento,
          m,
        );
        if (existentes.length) {
          throw conflicto(
            existentes.some((u) => u.usu_correo.toLowerCase() === correo)
              ? "Ya existe una cuenta con ese email."
              : "Ya existe una cuenta con esa identificación.",
          );
        }
        const nuevo = await this.identity.crear(
          {
            correo,
            passwordHash,
            nombreCompleto: dto.nombre,
            documento,
            telefono: dto.telefono ?? null,
            rol: "CLIENTE",
          },
          m,
        );
        await this.billing.crearPrincipal(
          nuevo.usu_id,
          documento,
          dto.nombre,
          correo,
          dto.telefono ?? null,
          m,
        );
        return nuevo;
      });
      this.logger.log(
        evento("clientes.alta_panel", {
          correlation_id: currentCorrelationId(),
          actor_id: actor,
          client_id: usuario.usu_uuid,
          con_acceso_web: Boolean(dto.password),
        }),
      );
      return this.detalle(usuario.usu_uuid);
    } catch (err) {
      if (String(err?.code) === "23505")
        throw conflicto("Ya existe una cuenta con ese email o identificación.");
      throw err;
    }
  }

  async detalle(id: string) {
    const usuario = UUID_REGEX.test(id)
      ? await this.identity.findByUuid(id)
      : null;
    if (!usuario || this.identity.rolApi(usuario) !== "TURISTA") {
      throw problem(
        HttpStatus.NOT_FOUND,
        "CLIENT_NOT_FOUND",
        "cliente-no-encontrado",
        "Cliente no encontrado",
        `No existe un cliente con identificador '${id}'.`,
      );
    }
    const [perfiles, ordenes] = await Promise.all([
      this.billing.activos(usuario.usu_id),
      this.orders.delUsuario(usuario.usu_id),
    ]);
    const reservas = await this.bookings.porOrdenes(
      ordenes.map((o) => o.ord_id),
    );
    return {
      ...this.toResponse(usuario),
      activo: usuario.usu_activo,
      creado_en: usuario.usu_creado_en,
      ultimo_acceso: usuario.usu_ultimo_acceso,
      perfiles_facturacion: perfiles.map((p) => ({
        ...facturacion(p),
        principal: p.dfa_es_principal,
      })),
      reservas: await this.resumenReservas(reservas, ordenes),
    };
  }

  private async resumenReservas(reservas: Reserva[], ordenes: Orden[]) {
    const ordenPorId = new Map(ordenes.map((o) => [o.ord_id, o]));
    const turnos = await this.inventory.ubicaciones(
      reservas.map((r) => r.dis_id),
    );
    const atracciones = new Map(
      (
        await this.catalog.findByIds([...turnos.values()].map((t) => t.atrId))
      ).map((a) => [a.atr_id, a]),
    );
    return reservas.map((r) => {
      const turno = turnos.get(r.dis_id);
      const orden = ordenPorId.get(r.ord_id);
      return {
        reservation_id: r.res_uuid,
        reservation_code: r.res_codigo,
        canal: orden?.ord_canal ?? null,
        estado: r.estado?.est_codigo ?? null,
        atraccion: atracciones.get(turno?.atrId)?.atr_nombre ?? null,
        fecha: turno?.fecha ?? null,
        hora: turno?.hora ?? null,
        tickets: r.res_numero_tickets,
        total: r.res_subtotal,
        creada_en: r.res_creado_en,
      };
    });
  }

  // ---------- Booking (v3) ----------

  async buscar(q: ClientesQueryDto): Promise<ClienteResponseDto> {
    if (!q.email && !q.identificacion) {
      throw problem(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "validacion",
        "Faltan criterios de búsqueda",
        "Envíe email, identificacion o ambos.",
      );
    }
    const encontrados = await this.identity.buscarPorCorreoODocumento(
      q.email ?? null,
      q.identificacion ?? null,
    );
    // Con ambos criterios gana la coincidencia por correo.
    const usuario =
      encontrados.find(
        (u) => q.email && u.usu_correo.toLowerCase() === q.email.toLowerCase(),
      ) ?? encontrados[0];
    this.logger.log(
      evento("clientes.consulta", {
        correlation_id: currentCorrelationId(),
        email: correoParcial(q.email),
        identificacion: q.identificacion
          ? `***${q.identificacion.slice(-3)}`
          : null,
        encontrado: Boolean(usuario),
        client_id: usuario?.usu_uuid ?? null,
      }),
    );
    if (!usuario) {
      throw problem(
        HttpStatus.NOT_FOUND,
        "CLIENT_NOT_FOUND",
        "cliente-no-encontrado",
        "Cliente no encontrado",
        "No existe un turista con esos datos en Ecuatravel.",
      );
    }
    return this.toResponse(usuario);
  }

  /**
   * Alta de un turista creado en Booking: rol CLIENTE, perfil de facturación y una
   * contraseña aleatoria que nadie conoce (existe para enlazar sus reservas).
   * Si ya existía no se duplica.
   */
  async registrar(
    dto: CreateClienteDto,
  ): Promise<{ creado: boolean; cliente: ClienteResponseDto }> {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    try {
      const r = await this.dataSource.transaction((m) =>
        this.registrarEn(dto, passwordHash, m),
      );
      this.logger.log(
        evento("clientes.registro", {
          correlation_id: currentCorrelationId(),
          email: correoParcial(dto.email),
          creado: r.creado,
          client_id: r.cliente.client_id,
        }),
      );
      return r;
    } catch (err) {
      // Dos altas simultáneas del mismo turista: la segunda devuelve la primera.
      if (String(err?.code) !== "23505") throw err;
      const [existente] = await this.identity.buscarPorCorreoODocumento(
        dto.email,
        dto.identificacion,
      );
      if (!existente) throw err;
      return { creado: false, cliente: this.toResponse(existente) };
    }
  }

  private async registrarEn(
    dto: CreateClienteDto,
    passwordHash: string,
    m: EntityManager,
  ) {
    const documento = dto.identificacion.toUpperCase();
    const encontrados = await this.identity.buscarPorCorreoODocumento(
      dto.email,
      documento,
      m,
    );
    if (encontrados.length > 1) {
      throw conflicto(
        "El email y la identificación pertenecen a turistas distintos.",
      );
    }
    const [existente] = encontrados;
    if (existente) {
      if (existente.usu_documento && existente.usu_documento !== documento) {
        throw conflicto("El email ya está registrado con otra identificación.");
      }
      if (existente.usu_correo.toLowerCase() !== dto.email.toLowerCase()) {
        throw conflicto("La identificación ya está registrada con otro email.");
      }
      // Completa lo que faltaba sin pisar datos existentes.
      if (
        !existente.usu_documento ||
        (!existente.usu_telefono && dto.telefono)
      ) {
        await m.update(
          Usuario,
          { usu_id: existente.usu_id },
          {
            usu_documento: existente.usu_documento ?? documento,
            usu_telefono: existente.usu_telefono ?? dto.telefono ?? null,
          },
        );
      }
      const actual = await m.findOneByOrFail(Usuario, {
        usu_id: existente.usu_id,
      });
      return { creado: false, cliente: this.toResponse(actual) };
    }
    const nuevo = await this.identity.crear(
      {
        correo: dto.email.toLowerCase(),
        passwordHash,
        nombreCompleto: dto.nombre,
        documento,
        telefono: dto.telefono ?? null,
        rol: "CLIENTE",
      },
      m,
    );
    await this.billing.crearPrincipal(
      nuevo.usu_id,
      documento,
      dto.nombre,
      dto.email.toLowerCase(),
      dto.telefono ?? null,
      m,
    );
    return { creado: true, cliente: this.toResponse(nuevo) };
  }

  /** Usuario al que se enlaza una reserva de Booking: por client_id o por email. */
  async resolverUsuId(
    clientId: string | null,
    email: string | null,
    manager: EntityManager,
  ): Promise<number | null> {
    if (clientId && UUID_REGEX.test(clientId)) {
      const usuario = await this.identity.findByUuid(clientId, manager);
      if (usuario) return usuario.usu_id;
    }
    if (!email) return null;
    const [usuario] = await this.identity.buscarPorCorreoODocumento(
      email,
      null,
      manager,
    );
    return usuario?.usu_id ?? null;
  }

  async clientIdDeOrden(orden: Orden): Promise<string | null> {
    if (orden.usu_id) {
      const usuario = await this.identity.findById(orden.usu_id);
      if (usuario) return usuario.usu_uuid;
    }
    if (!orden.ord_contacto_correo) return null;
    const [usuario] = await this.identity.buscarPorCorreoODocumento(
      orden.ord_contacto_correo,
      null,
    );
    return usuario?.usu_uuid ?? null;
  }
}
