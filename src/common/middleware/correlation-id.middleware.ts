import { NextFunction, Request, Response } from "express";
import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export const CORRELATION_HEADER = "x-correlation-id";

const correlationStorage = new AsyncLocalStorage<string>();

// Reutiliza el X-Correlation-Id recibido (o genera uno) y lo devuelve en la respuesta.
// También lo deja disponible para todo el ciclo de la petición (currentCorrelationId).
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.headers[CORRELATION_HEADER];
  const value =
    typeof incoming === "string" && /^[\w.:-]{1,100}$/.test(incoming)
      ? incoming
      : randomUUID();
  req.headers[CORRELATION_HEADER] = value;
  res.setHeader("X-Correlation-Id", value);
  correlationStorage.run(value, next);
}

export function getCorrelationId(req: Request): string {
  return req.headers[CORRELATION_HEADER] as string;
}

export function currentCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}
