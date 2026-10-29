import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { getCorrelationId } from "../middleware/correlation-id.middleware";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Internal server error" };

    const detail =
      typeof errorResponse === "object" && errorResponse !== null
        ? (errorResponse as any).message ||
          (errorResponse as any).detail ||
          errorResponse
        : errorResponse;

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error("Unhandled Exception:", exception);
    }

    const body = {
      status,
      error:
        exception instanceof HttpException
          ? exception.name
          : "InternalServerError",
      details: detail,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    // Problem Details propios (type/title/code) se respetan: Booking decide
    // la compensación de la Saga leyendo `code` (p. ej. OUT_OF_STOCK).
    const problem =
      typeof errorResponse === "object" && errorResponse !== null
        ? (errorResponse as Record<string, any>)
        : {};

    // Campos compatibles con RFC 7807 (application/problem+json) sin romper los legados.
    response.status(status).json({
      type: problem.type ?? `https://api.booking-hub.com/errors/${status}`,
      title:
        problem.title ??
        (typeof detail === "string"
          ? detail
          : exception instanceof HttpException
            ? exception.name
            : "Internal Server Error"),
      detail: typeof detail === "string" ? detail : JSON.stringify(detail),
      instance: body.path,
      ...(problem.code && { code: problem.code }),
      ...(problem.invalid_params && { invalid_params: problem.invalid_params }),
      correlation_id: getCorrelationId(request),
      ...body,
    });
  }
}
