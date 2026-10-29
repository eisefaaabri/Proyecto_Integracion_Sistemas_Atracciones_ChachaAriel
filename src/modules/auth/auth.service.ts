import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import {
  IdentityService,
  NombreRol,
  nombreCompleto,
} from "../identity/identity.service";
import { Usuario } from "../identity/identity.entities";
import { BillingProfileService } from "../billing-profile/billing-profile.service";
import { RolUsuario } from "./rol-usuario.enum";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto } from "./dto/create-user.dto";

const rolModelo = (rol: RolUsuario): NombreRol =>
  rol === RolUsuario.ADMIN ? "ADMIN" : "CLIENTE";

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly identity: IdentityService,
    private readonly billing: BillingProfileService,
    private readonly jwtService: JwtService,
  ) {}

  private sesion(u: Usuario) {
    const rol = this.identity.rolApi(u);
    // El sub es el UUID público del usuario (usu_uuid): el resto de la app lo usa así.
    const payload = { email: u.usu_correo, sub: u.usu_uuid, rol, roles: [rol] };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: u.usu_uuid, email: u.usu_correo, rol },
    };
  }

  private vistaUsuario(u: Usuario) {
    return {
      id: u.usu_uuid,
      email: u.usu_correo,
      rol: this.identity.rolApi(u),
      estado: u.usu_activo,
      created_at: u.usu_creado_en,
      nombre_completo: nombreCompleto(u) || null,
      dni: u.usu_documento,
      telefono: u.usu_telefono,
    };
  }

  async validateUser(email: string, pass: string): Promise<Usuario> {
    const user = await this.identity.findByCorreoConPassword(email);
    if (
      !user ||
      !user.usu_activo ||
      !(await bcrypt.compare(pass, user.usu_password))
    ) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    await this.identity.registrarAcceso(user.usu_id);
    return this.sesion(user);
  }

  /** Alta de cuenta pública (rol CLIENTE, expuesto como TURISTA) con sesión iniciada. */
  async register(dto: RegisterDto) {
    const usuario = await this.crearCuenta({
      email: dto.email,
      password: dto.password,
      nombre_completo: dto.nombre_completo,
      dni: dto.dni,
      telefono: dto.telefono,
      rol: RolUsuario.TURISTA,
    });
    return this.sesion(usuario);
  }

  async createUser(dto: CreateUserDto) {
    const usuario = await this.crearCuenta({
      ...dto,
      rol: dto.rol ?? RolUsuario.ADMIN,
    });
    return this.vistaUsuario(usuario);
  }

  private async crearCuenta(d: {
    email: string;
    password: string;
    nombre_completo?: string;
    dni?: string;
    telefono?: string;
    rol: RolUsuario;
  }): Promise<Usuario> {
    const passwordHash = await bcrypt.hash(d.password, 10);
    try {
      return await this.dataSource.transaction(async (m) => {
        // Pre-checks con mensajes limpios (además de los constraints únicos).
        if (await this.identity.existeCorreo(d.email, m)) {
          throw new ConflictException("El email ya está registrado");
        }
        if (d.dni && (await this.identity.existeDocumento(d.dni, m))) {
          throw new ConflictException(
            "El DNI ingresado ya pertenece a otra cuenta",
          );
        }
        const usuario = await this.identity.crear(
          {
            correo: d.email,
            passwordHash,
            nombreCompleto: d.nombre_completo,
            documento: d.dni,
            telefono: d.telefono,
            rol: rolModelo(d.rol),
          },
          m,
        );
        await this.billing.crearPrincipal(
          usuario.usu_id,
          d.dni,
          d.nombre_completo || nombreCompleto(usuario),
          d.email,
          d.telefono ?? null,
          m,
        );
        return usuario;
      });
    } catch (err) {
      // Si algún unique constraint saltó en carrera (email o DNI), responder 409.
      if (String(err?.code) === "23505") {
        const constraint = String(err?.constraint ?? "");
        throw new ConflictException(
          constraint.includes("documento")
            ? "El DNI ingresado ya pertenece a otra cuenta"
            : "El email ya está registrado",
        );
      }
      throw err;
    }
  }

  async getAllUsers() {
    return (await this.identity.listar()).map((u) => this.vistaUsuario(u));
  }

  async updateUserRole(id: string, rol: RolUsuario) {
    const usuario = await this.identity.findByUuid(id);
    if (!usuario) throw new ConflictException("Usuario no encontrado");
    await this.dataSource.transaction((m) =>
      this.identity.cambiarRol(usuario, rolModelo(rol), m),
    );
    const actualizado = await this.identity.findByUuid(id);
    return {
      id: actualizado.usu_uuid,
      email: actualizado.usu_correo,
      rol: this.identity.rolApi(actualizado),
    };
  }
}
