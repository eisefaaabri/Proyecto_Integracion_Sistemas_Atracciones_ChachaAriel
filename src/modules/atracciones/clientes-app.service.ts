import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { Usuario } from "../identity/identity.entities";
import { IdentityService, nombreCompleto } from "../identity/identity.service";
import { Orden } from "../order/order.entities";
import { UUID_REGEX, problem } from "./booking.utils";
import {
  ClienteResponseDto,
  ClientesQueryDto,
  CreateClienteDto,
} from "./dto/clientes.dto";

function conflicto(detail: string) {
  return problem(
    HttpStatus.CONFLICT,
    "CLIENT_CONFLICT",
    "cliente-en-conflicto",
    "Datos de cliente en conflicto",
    detail,
  );
}

/**
 * Turistas que Booking registra en Ecuatravel. Son usuarios con rol CLIENTE y una
 * contraseña aleatoria que nadie conoce: existen para enlazar sus reservas, no para
 * iniciar sesión.
 */
@Injectable()
export class ClientesAppService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly identity: IdentityService,
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

  /** Devuelve el cliente y si se creó ahora; si ya existía no se duplica. */
  async registrar(
    dto: CreateClienteDto,
  ): Promise<{ creado: boolean; cliente: ClienteResponseDto }> {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    try {
      return await this.dataSource.transaction((m) =>
        this.registrarEn(dto, passwordHash, m),
      );
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
