import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";

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

    // Campos compatibles con RFC 7807 (application/problem+json) sin romper los legados.
    response.status(status).json({
      type: `https://api.booking-hub.com/errors/${status}`,
      title:
        typeof detail === "string"
          ? detail
          : exception instanceof HttpException
            ? exception.name
            : "Internal Server Error",
      detail: typeof detail === "string" ? detail : JSON.stringify(detail),
      instance: body.path,
      ...body,
    });
  }
}
