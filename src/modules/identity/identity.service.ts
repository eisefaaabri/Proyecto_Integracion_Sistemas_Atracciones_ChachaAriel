import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Rol, Usuario, UsuarioRol } from "./identity.entities";

export type NombreRol = "ADMIN" | "OPERADOR" | "CLIENTE";

export interface NuevoUsuario {
  correo: string;
  passwordHash: string;
  nombreCompleto?: string | null;
  documento?: string | null;
  telefono?: string | null;
  rol: NombreRol;
}

const RE_DOCUMENTO = /^[A-Z0-9]{5,20}$/;
const RE_TELEFONO = /^\+?[0-9]{7,15}$/;

export function separarNombre(
  completo: string | null | undefined,
  correo: string,
): [string, string | null] {
  const limpio = (completo ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return [correo.split("@")[0].slice(0, 120), null];
  const i = limpio.indexOf(" ");
  return i < 0
    ? [limpio.slice(0, 120), null]
    : [limpio.slice(0, i).slice(0, 120), limpio.slice(i + 1).slice(0, 120)];
}

export function nombreCompleto(
  u: Pick<Usuario, "usu_nombre" | "usu_apellido">,
): string {
  return [u.usu_nombre, u.usu_apellido].filter(Boolean).join(" ");
}

@Injectable()
export class IdentityService {
  private roles: Map<NombreRol, number> | null = null;

  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Rol) private readonly rolesRepo: Repository<Rol>,
  ) {}

  private async rolId(nombre: NombreRol): Promise<number> {
    if (!this.roles) {
      const filas = await this.rolesRepo.find();
      this.roles = new Map(
        filas.map((r) => [r.rol_nombre as NombreRol, r.rol_id]),
      );
    }
    return this.roles.get(nombre);
  }

  // Rol expuesto por la API v2 (el frontend conoce ADMIN y TURISTA).
  rolApi(u: Usuario): string {
    const nombres = (u.roles ?? []).map((r) => r.rol?.rol_nombre);
    if (nombres.includes("ADMIN")) return "ADMIN";
    if (nombres.includes("OPERADOR")) return "OPERADOR";
    return "TURISTA";
  }

  findByUuid(uuid: string, manager?: EntityManager): Promise<Usuario | null> {
    return (manager ?? this.usuarios.manager).findOne(Usuario, {
      where: { usu_uuid: uuid },
      relations: { roles: { rol: true } },
    });
  }

  findById(id: number): Promise<Usuario | null> {
    return this.usuarios.findOne({
      where: { usu_id: id },
      relations: { roles: { rol: true } },
    });
  }

  findByCorreoConPassword(correo: string): Promise<Usuario | null> {
    return this.usuarios
      .createQueryBuilder("u")
      .addSelect("u.usu_password")
      .leftJoinAndSelect("u.roles", "ur")
      .leftJoinAndSelect("ur.rol", "r")
      .where("u.usu_correo = :correo", { correo })
      .getOne();
  }

  async existeCorreo(
    correo: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (
      (await (manager ?? this.usuarios.manager).count(Usuario, {
        where: { usu_correo: correo },
      })) > 0
    );
  }

  async existeDocumento(
    documento: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return (
      (await (manager ?? this.usuarios.manager).count(Usuario, {
        where: { usu_documento: documento.toUpperCase() },
      })) > 0
    );
  }

  async crear(datos: NuevoUsuario, manager: EntityManager): Promise<Usuario> {
    const [nombre, apellido] = separarNombre(
      datos.nombreCompleto,
      datos.correo,
    );
    const documento = datos.documento?.toUpperCase();
    const { identifiers } = await manager.insert(Usuario, {
      usu_correo: datos.correo,
      usu_password: datos.passwordHash,
      usu_nombre: nombre,
      usu_apellido: apellido,
      usu_documento:
        documento && RE_DOCUMENTO.test(documento) ? documento : null,
      usu_telefono:
        datos.telefono && RE_TELEFONO.test(datos.telefono)
          ? datos.telefono
          : null,
      usu_activo: true,
    });
    const usuId = Number(identifiers[0].usu_id);
    await manager.insert(UsuarioRol, {
      usu_id: usuId,
      rol_id: await this.rolId(datos.rol),
    });
    return manager.findOneOrFail(Usuario, {
      where: { usu_id: usuId },
      relations: { roles: { rol: true } },
    });
  }

  listar(): Promise<Usuario[]> {
    return this.usuarios.find({
      relations: { roles: { rol: true } },
      order: { usu_creado_en: "DESC" },
    });
  }

  async cambiarRol(
    usuario: Usuario,
    rol: NombreRol,
    manager: EntityManager,
  ): Promise<void> {
    await manager.delete(UsuarioRol, { usu_id: usuario.usu_id });
    await manager.insert(UsuarioRol, {
      usu_id: usuario.usu_id,
      rol_id: await this.rolId(rol),
    });
  }

  async registrarAcceso(usuId: number): Promise<void> {
    await this.usuarios.update(
      { usu_id: usuId },
      { usu_ultimo_acceso: new Date() },
    );
  }
}
