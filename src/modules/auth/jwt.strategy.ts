import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const secret = configService.get<string>("JWT_SECRET");
    if (!secret && configService.get<string>("NODE_ENV") === "production") {
      throw new Error("JWT_SECRET es obligatorio cuando NODE_ENV=production");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || "fallback_secret_for_dev_only_123",
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException("Token inválido o expirado");
    }
    // Acepta tokens emitidos con `roles` (array) o `rol` (único).
    const rawRoles = Array.isArray(payload.roles)
      ? payload.roles
      : payload.rol
        ? [payload.rol]
        : [];
    return {
      userId: payload.sub,
      email: payload.email,
      roles: rawRoles.map(String).map((r) => r.toUpperCase()),
    };
  }
}
