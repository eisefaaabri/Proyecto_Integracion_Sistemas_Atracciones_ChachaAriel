import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import { Usuario } from "../identity/identity.entities";
import {
  IdentityService,
  NombreRol,
  nombreCompleto,
} from "../identity/identity.service";
import { UUID_REGEX } from "../atracciones/booking.utils";
import { evento } from "../../common/logging/evento";
import {
  CreatePersonalDto,
  PersonalQueryDto,
  ROLES_PERSONAL,
  RolPersonal,
} from "./dto/personal.dto";

/**
 * Módulo Personal: cuentas que operan la tienda (ADMIN y OPERADOR). Comparten la
 * identidad (ms_identity) con los clientes, pero se gestionan por separado.
 */
@Injectable()
export class PersonalService {
  private readonly logger = new Logger(PersonalService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly identity: IdentityService,
  ) {}

  private vista(u: Usuario) {
    return {
      id: u.usu_uuid,
      email: u.usu_correo,
      nombre: nombreCompleto(u),
      rol: this.identity.rolApi(u),
      activo: u.usu_activo,
      telefono: u.usu_telefono,
      creado_en: u.usu_creado_en,
      ultimo_acceso: u.usu_ultimo_acceso,
    };
  }

  async listar(q: PersonalQueryDto) {
    const [usuarios, total] = await this.identity.listarPorRoles(
      [...ROLES_PERSONAL],
      { q: q.q?.trim() || null },
    );
    return {
      data: usuarios.map((u) => this.vista(u)),
      meta: { totalItems: total },
    };
  }

  async crear(dto: CreatePersonalDto, actor: string) {
    const correo = dto.email.toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const usuario = await this.dataSource.transaction(async (m) => {
        const [existente] = await this.identity.buscarPorCorreoODocumento(
          correo,
          null,
          m,
        );
        if (existente) {
          throw new ConflictException(
            "El email ya está registrado. Si es un cliente, dale acceso desde su ficha.",
          );
        }
        return this.identity.crear(
          {
            correo,
            passwordHash,
            nombreCompleto: dto.nombre_completo,
            telefono: dto.telefono ?? null,
            rol: dto.rol,
          },
          m,
        );
      });
      this.log("personal.alta", actor, usuario, { rol: dto.rol });
      return this.vista(usuario);
    } catch (err) {
      if (String(err?.code) === "23505")
        throw new ConflictException("El email ya está registrado.");
      throw err;
    }
  }

  async cambiarRol(id: string, rol: RolPersonal, actor: string) {
    const usuario = await this.otroUsuario(id, actor);
    if (
      this.identity.rolApi(usuario) === "ADMIN" &&
      rol !== "ADMIN" &&
      usuario.usu_activo
    )
      await this.exigirOtroAdmin();
    await this.dataSource.transaction((m) =>
      this.identity.cambiarRol(usuario, rol, m),
    );
    this.log("personal.rol", actor, usuario, { rol });
    return this.vista(await this.identity.findByUuid(id));
  }

  /** Quita el acceso de personal: la cuenta queda como cliente. */
  async quitarAcceso(id: string, actor: string) {
    const usuario = await this.otroUsuario(id, actor);
    if (!this.esPersonal(usuario))
      throw new NotFoundException("La cuenta no pertenece al personal");
    if (this.identity.rolApi(usuario) === "ADMIN") await this.exigirOtroAdmin();
    await this.dataSource.transaction((m) =>
      this.identity.cambiarRol(usuario, "CLIENTE", m),
    );
    this.log("personal.baja", actor, usuario);
  }

  async cambiarEstado(id: string, activo: boolean, actor: string) {
    const usuario = await this.otroUsuario(id, actor);
    if (!this.esPersonal(usuario))
      throw new NotFoundException("La cuenta no pertenece al personal");
    if (!activo && this.identity.rolApi(usuario) === "ADMIN")
      await this.exigirOtroAdmin();
    await this.identity.cambiarEstado(usuario.usu_id, activo);
    this.log("personal.estado", actor, usuario, { activo });
    return this.vista(await this.identity.findByUuid(id));
  }

  private esPersonal(u: Usuario): boolean {
    return (ROLES_PERSONAL as readonly string[]).includes(
      this.identity.rolApi(u),
    );
  }

  // Nadie cambia su propia cuenta desde aquí: evita quedarse sin acceso por error.
  private async otroUsuario(id: string, actor: string): Promise<Usuario> {
    const usuario = UUID_REGEX.test(id)
      ? await this.identity.findByUuid(id)
      : null;
    if (!usuario) throw new NotFoundException("Usuario no encontrado");
    if (usuario.usu_uuid === actor)
      throw new ForbiddenException("No puedes modificar tu propia cuenta");
    return usuario;
  }

  private async exigirOtroAdmin() {
    const [admins] = await this.identity.listarPorRoles(["ADMIN" as NombreRol]);
    if (admins.filter((a) => a.usu_activo).length <= 1)
      throw new ConflictException(
        "Debe quedar al menos un administrador activo",
      );
  }

  private log(event: string, actor: string, u: Usuario, extra: object = {}) {
    this.logger.log(
      evento(event, { actor_id: actor, usuario_id: u.usu_uuid, ...extra }),
    );
  }
}
