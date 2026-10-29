import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

export const CORRELATION_HEADER = "x-correlation-id";

// Reutiliza el X-Correlation-Id recibido (o genera uno) y lo devuelve en la respuesta.
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
  next();
}

export function getCorrelationId(req: Request): string {
  return req.headers[CORRELATION_HEADER] as string;
}
