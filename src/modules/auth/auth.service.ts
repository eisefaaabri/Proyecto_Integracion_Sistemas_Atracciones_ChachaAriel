import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { Usuario } from "./entities/usuario.entity";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
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
}
