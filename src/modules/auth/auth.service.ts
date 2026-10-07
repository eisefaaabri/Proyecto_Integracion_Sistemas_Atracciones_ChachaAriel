import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { Usuario, RolUsuario } from "./entities/usuario.entity";
import { Cliente } from "../atracciones/entities/cliente.entity";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<Usuario> {
    const user = await this.usuarioRepository.findOne({ where: { email } });
    if (!user || !user.estado) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    const isMatch = await bcrypt.compare(pass, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    // El sub DEBE ser el UUIDv4 del usuario para que el resto de la app funcione.
    const payload = {
      email: user.email,
      sub: user.id,
      rol: user.rol,
      roles: [user.rol],
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        rol: user.rol,
      },
    };
  }

  /**
   * Alta de cuenta pública (rol TURISTA).
   * Crea usuario + cliente (necesario para reservar, reseñas y wishlist).
   * Devuelve el mismo shape que /login para que el frontend quede con sesión.
   */
  async register(registerDto: RegisterDto) {
    const connection = this.usuarioRepository.manager.connection;
    const queryRunner = connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Pre-checks con mensajes limpios (además de los constraints únicos).
      const emailEnUso = await queryRunner.manager.findOne(Usuario, {
        where: { email: registerDto.email },
      });
      if (emailEnUso) {
        throw new ConflictException("El email ya está registrado");
      }
      const dniEnUso = await queryRunner.manager.findOne(Cliente, {
        where: { dni: registerDto.dni },
      });
      if (dniEnUso) {
        throw new ConflictException(
          "El DNI ingresado ya pertenece a otra cuenta",
        );
      }

      const passwordHash = await bcrypt.hash(registerDto.password, 10);
      const usuario = queryRunner.manager.create(Usuario, {
        email: registerDto.email,
        password_hash: passwordHash,
        rol: RolUsuario.TURISTA,
        estado: true,
      });
      await queryRunner.manager.save(usuario);

      const cliente = queryRunner.manager.create(Cliente, {
        dni: registerDto.dni,
        nombre_completo: registerDto.nombre_completo,
        telefono: registerDto.telefono ?? null,
        usuario,
      });
      await queryRunner.manager.save(cliente);

      await queryRunner.commitTransaction();

      const payload = {
        email: usuario.email,
        sub: usuario.id,
        rol: usuario.rol,
        roles: [usuario.rol],
      };

      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: usuario.id,
          email: usuario.email,
          rol: usuario.rol,
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      // Si algún unique constraint saltó en carrera (email o DNI), responder 409.
      if (String(err?.code) === "23505") {
        const constraint = String(err?.constraint ?? "");
        if (constraint.includes("dni") || constraint.includes("cliente")) {
          throw new ConflictException(
            "El DNI ingresado ya pertenece a otra cuenta",
          );
        }
        throw new ConflictException("El email ya está registrado");
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
