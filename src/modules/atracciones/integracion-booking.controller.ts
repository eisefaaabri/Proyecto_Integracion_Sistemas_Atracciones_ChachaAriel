import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { IntegracionBookingService } from "./integracion-booking.service";
import {
  CancelBookingReservaDto,
  CheckinBookingReservaDto,
  CreateBookingReservaDto,
} from "./dto/booking-reserva.dto";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { IdempotencyKeyGuard } from "../../common/guards/idempotency-key.guard";
import { getCorrelationId } from "../../common/middleware/correlation-id.middleware";

const ID_PARAM = {
  name: "id",
  description: "UUID, código de reserva (ECT-XXXXXX) o booking_reservation_id",
};

// "reservas" sin prefijo cubre el caso en que Booking registró baseUrlRest como /api/v3.
@ApiTags("Integración Booking (v3)")
@Controller({ path: ["atracciones/reservas", "reservas"], version: "3" })
export class IntegracionBookingController {
  constructor(private readonly service: IntegracionBookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard, IdempotencyKeyGuard)
  @ApiSecurity("ApiKeyAuth")
  @ApiOperation({
    summary: "Recibir una reserva despachada por Booking Prototipo",
    description:
      "Descuenta cupos de forma atómica. 409 con code OUT_OF_STOCK dispara la compensación de la Saga en Booking.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "UUID v4",
  })
  @ApiHeader({ name: "X-Correlation-Id", required: false })
  @ApiHeader({ name: "X-Node-Id", required: false })
  @ApiResponse({ status: 201, description: "Reserva confirmada." })
  @ApiResponse({ status: 400, description: "Validación o SLOT_TIME_MISMATCH." })
  @ApiResponse({ status: 401, description: "X-API-Key ausente o inválida." })
  @ApiResponse({ status: 404, description: "La atracción no existe." })
  @ApiResponse({ status: 409, description: "OUT_OF_STOCK." })
  @ApiResponse({ status: 422, description: "Fecha en el pasado." })
  async crear(
    @Body() dto: CreateBookingReservaDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reserva = await this.service.crearReserva(
      dto,
      idempotencyKey,
      getCorrelationId(req),
    );
    res.setHeader(
      "Location",
      `/api/v3/atracciones/reservas/${reserva.reservation_id}`,
    );
    return reserva;
  }

  @Get(":id")
  @UseGuards(ApiKeyGuard)
  @ApiSecurity("ApiKeyAuth")
  @ApiOperation({ summary: "Consultar estado y voucher de una reserva" })
  @ApiParam(ID_PARAM)
  @ApiHeader({ name: "X-Correlation-Id", required: false })
  @ApiResponse({ status: 200, description: "Ficha de la reserva." })
  @ApiResponse({ status: 401, description: "X-API-Key ausente o inválida." })
  @ApiResponse({ status: 404, description: "RESERVATION_NOT_FOUND." })
  obtener(@Param("id") id: string) {
    return this.service.obtenerReserva(id);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity("ApiKeyAuth")
  @ApiOperation({
    summary: "Cancelar una reserva (compensación de la Saga)",
    description:
      "Reintegra los cupos y marca la factura como reembolsada. Repetir la llamada devuelve 200 con el mismo estado.",
  })
  @ApiParam(ID_PARAM)
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiHeader({ name: "X-Correlation-Id", required: false })
  @ApiResponse({ status: 200, description: "Reserva cancelada." })
  @ApiResponse({ status: 404, description: "RESERVATION_NOT_FOUND." })
  @ApiResponse({ status: 409, description: "ALREADY_CHECKED_IN." })
  cancelar(
    @Param("id") id: string,
    @Body() dto: CancelBookingReservaDto,
    @Req() req: Request,
  ) {
    return this.service.cancelarReserva(id, dto, getCorrelationId(req));
  }

  @Post(":id/checkin")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard, IdempotencyKeyGuard)
  @ApiSecurity("ApiKeyAuth")
  @ApiOperation({
    summary: "Check-in presencial en el punto de encuentro",
    description:
      "Valida el documento del titular y, si se envía, el voucher QR. Un reintento con la misma Idempotency-Key devuelve el pase ya emitido.",
  })
  @ApiParam(ID_PARAM)
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "UUID v4",
  })
  @ApiHeader({ name: "X-Correlation-Id", required: false })
  @ApiResponse({ status: 200, description: "Check-in registrado." })
  @ApiResponse({
    status: 403,
    description: "IDENTITY_MISMATCH o VOUCHER_INVALID.",
  })
  @ApiResponse({ status: 404, description: "RESERVATION_NOT_FOUND." })
  @ApiResponse({
    status: 409,
    description: "Reserva cancelada o check-in ya hecho con otra clave.",
  })
  checkin(
    @Param("id") id: string,
    @Body() dto: CheckinBookingReservaDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Req() req: Request,
  ) {
    return this.service.registrarCheckin(
      id,
      dto,
      idempotencyKey,
      getCorrelationId(req),
    );
  }
}
