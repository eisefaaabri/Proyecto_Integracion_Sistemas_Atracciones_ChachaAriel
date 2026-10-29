import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { Request } from "express";

const BASE: CorsOptions = {
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  // El frontend envía el JWT en Authorization; no hay cookies.
  credentials: false,
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Idempotency-Key",
    "X-Correlation-Id",
    "X-API-Key",
    "X-Node-Id",
    "Cache-Control",
    "Pragma",
  ],
  exposedHeaders: [
    "Location",
    "X-Correlation-Id",
    "Idempotency-Key",
    "X-API-Deprecation-Date",
  ],
  maxAge: 600,
};

// El healthcheck es público y de solo lectura: el tablero de Booking puede
// consultarlo desde el navegador sin estar en la lista.
const HEALTH_PATH = /^\/api\/v\d+\/(atracciones\/)?health\/?(\?|$)/;

function normalizar(origen: string): string {
  return origen.trim().replace(/\/+$/, "").toLowerCase();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Orígenes: FRONTEND_URL + CORS_ORIGINS (separados por coma). En desarrollo se
// suman localhost, 127.0.0.1 y la IP de Tailscale en cualquier puerto.
export function buildCorsOptions(config: ConfigService) {
  const logger = new Logger("CORS");
  const produccion = config.get<string>("NODE_ENV") === "production";

  const permitidos = new Set(
    [config.get<string>("FRONTEND_URL"), config.get<string>("CORS_ORIGINS")]
      .filter(Boolean)
      .flatMap((valor) => valor.split(","))
      .map(normalizar)
      .filter((origen) => /^https?:\/\/[^\s/]+$/.test(origen)),
  );

  const hostsDev = ["localhost", "127\\.0\\.0\\.1"];
  const tailscale = config.get<string>("TAILSCALE_LOCAL_IP");
  if (tailscale && /^\d{1,3}(\.\d{1,3}){3}$/.test(tailscale)) {
    hostsDev.push(escaparRegex(tailscale));
  }
  const patronDev = new RegExp(
    `^https?://(${hostsDev.join("|")})(:\\d{1,5})?$`,
  );

  const permitido = (origen: string) =>
    permitidos.has(normalizar(origen)) ||
    (!produccion && patronDev.test(normalizar(origen)));

  if (produccion && permitidos.size === 0) {
    logger.warn(
      "Sin FRONTEND_URL ni CORS_ORIGINS: se rechazan todas las peticiones de otros orígenes.",
    );
  } else {
    logger.log(
      `Orígenes permitidos: ${[...permitidos].join(", ") || "(ninguno explícito)"}` +
        (produccion ? "" : " + localhost/Tailscale (desarrollo)"),
    );
  }

  // Un origen no permitido recibe la respuesta sin cabeceras CORS: el navegador
  // la bloquea. Las llamadas servidor a servidor (sin Origin) no se ven afectadas.
  return (
    req: Request,
    callback: (err: Error | null, options: CorsOptions) => void,
  ) => {
    const origen = req.header("Origin");
    const publico = HEALTH_PATH.test(req.originalUrl ?? req.url);
    callback(null, {
      ...BASE,
      origin: !origen ? false : publico || permitido(origen),
    });
  };
}
