import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { createHash, timingSafeEqual } from "crypto";

/**
 * Autenticación M2M (ApiKeyAuth del contrato v3) por la cabecera `X-API-Key`.
 * Si BOOKING_API_KEY no está definida, en desarrollo se deja pasar (prueba por
 * Tailscale) y en producción se rechaza todo.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("BOOKING_API_KEY");
    const isProduction = this.config.get<string>("NODE_ENV") === "production";

    if (!expected) {
      if (isProduction) throw this.unauthorized("API key no configurada");
      if (!this.warned) {
        this.logger.warn(
          "BOOKING_API_KEY no definida: endpoints M2M abiertos (solo desarrollo)",
        );
        this.warned = true;
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.headers["x-api-key"];
    if (typeof received !== "string" || !this.matches(received, expected)) {
      throw this.unauthorized("Cabecera X-API-Key ausente o inválida");
    }
    return true;
  }

  // Compara hashes para que timingSafeEqual reciba longitudes iguales.
  private matches(received: string, expected: string): boolean {
    const a = createHash("sha256").update(received).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
  }

  private unauthorized(detail: string) {
    return new HttpException(
      {
        type: "https://booking.epn.edu.ec/errors/unauthorized",
        title: "No autorizado",
        status: HttpStatus.UNAUTHORIZED,
        detail,
        code: "UNAUTHORIZED",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
