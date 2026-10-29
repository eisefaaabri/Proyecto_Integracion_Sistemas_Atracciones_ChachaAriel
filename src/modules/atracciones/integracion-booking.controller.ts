import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { IntegracionBookingService } from "./integracion-booking.service";
import { CreateBookingReservaDto } from "./dto/booking-reserva.dto";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { IdempotencyKeyGuard } from "../../common/guards/idempotency-key.guard";
import { getCorrelationId } from "../../common/middleware/correlation-id.middleware";

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
}
