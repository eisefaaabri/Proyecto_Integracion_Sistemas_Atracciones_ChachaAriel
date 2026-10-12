import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { Usuario, RolUsuario } from "./entities/usuario.entity";
import { Cliente } from "../atracciones/entities/cliente.entity";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto } from "./dto/create-user.dto";

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

  async createUser(createUserDto: CreateUserDto) {
    const emailEnUso = await this.usuarioRepository.findOne({
      where: { email: createUserDto.email },
    });
    if (emailEnUso) {
      throw new ConflictException("El email ya está registrado");
    }

    const rol = createUserDto.rol ?? RolUsuario.ADMIN;
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    if (createUserDto.dni && createUserDto.nombre_completo) {
      const connection = this.usuarioRepository.manager.connection;
      const queryRunner = connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const dniEnUso = await queryRunner.manager.findOne(Cliente, {
          where: { dni: createUserDto.dni },
        });
        if (dniEnUso) {
          throw new ConflictException("El DNI ingresado ya pertenece a otra cuenta");
        }

        const usuario = queryRunner.manager.create(Usuario, {
          email: createUserDto.email,
          password_hash: passwordHash,
          rol,
          estado: true,
        });
        await queryRunner.manager.save(usuario);

        const cliente = queryRunner.manager.create(Cliente, {
          dni: createUserDto.dni,
          nombre_completo: createUserDto.nombre_completo,
          telefono: createUserDto.telefono ?? null,
          usuario,
        });
        await queryRunner.manager.save(cliente);

        await queryRunner.commitTransaction();

        return {
          id: usuario.id,
          email: usuario.email,
          rol: usuario.rol,
          estado: usuario.estado,
          created_at: usuario.created_at,
          nombre_completo: cliente.nombre_completo,
          dni: cliente.dni,
          telefono: cliente.telefono,
        };
      } catch (err) {
        await queryRunner.rollbackTransaction();
        if (String(err?.code) === "23505") {
          throw new ConflictException("El email o DNI ya está registrado");
        }
        throw err;
      } finally {
        await queryRunner.release();
      }
    }

    const usuario = this.usuarioRepository.create({
      email: createUserDto.email,
      password_hash: passwordHash,
      rol,
      estado: true,
    });
    await this.usuarioRepository.save(usuario);

    return {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      estado: usuario.estado,
      created_at: usuario.created_at,
      nombre_completo: null,
      dni: null,
      telefono: null,
    };
  }

  async getAllUsers() {
    const users = await this.usuarioRepository.find({
      relations: ["cliente"],
      order: { created_at: "DESC" },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      rol: u.rol,
      estado: u.estado,
      created_at: u.created_at,
      nombre_completo: u.cliente?.nombre_completo ?? null,
      dni: u.cliente?.dni ?? null,
      telefono: u.cliente?.telefono ?? null,
    }));
  }

  async updateUserRole(id: string, rol: RolUsuario) {
    const user = await this.usuarioRepository.findOne({ where: { id } });
    if (!user) {
      throw new ConflictException("Usuario no encontrado");
    }
    user.rol = rol;
    await this.usuarioRepository.save(user);
    return {
      id: user.id,
      email: user.email,
      rol: user.rol,
    };
  }
}
