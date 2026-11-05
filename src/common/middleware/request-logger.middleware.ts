import { Logger } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { CORRELATION_HEADER } from "./correlation-id.middleware";
import { evento } from "../logging/evento";

const logger = new Logger("HTTP");
// El health check de Azure llama cada minuto: no se registra para no tapar lo importante.
const SIN_LOG = /\/health$/;

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const inicio = process.hrtime.bigint();
  res.on("finish", () => {
    const ruta = req.originalUrl.split("?")[0];
    if (SIN_LOG.test(ruta)) return;
    const data = {
      method: req.method,
      path: ruta,
      status: res.statusCode,
      duration_ms: Number((process.hrtime.bigint() - inicio) / 1_000_000n),
      correlation_id: req.headers[CORRELATION_HEADER],
    };
    if (res.statusCode >= 500) logger.error(evento("http.request", data));
    else if (res.statusCode >= 400) logger.warn(evento("http.request", data));
    else logger.log(evento("http.request", data));
  });
  next();
}
