import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { getCorrelationId } from "../../common/middleware/correlation-id.middleware";
import { BookingService } from "../booking/booking.service";
import { InventoryService } from "../inventory/inventory.service";
import { IntegracionBookingService } from "./integracion-booking.service";
import { ReservasAppService } from "./reservas-app.service";
import { hoyEcuador } from "./booking.utils";
import {
  AdminCheckinDto,
  AdminReservasQueryDto,
} from "./dto/admin-checkin.dto";

// Panel del guía o administrador: reservas de un día y check-in presencial.
@ApiTags("Panel B2B")
@ApiBearerAuth()
@Controller({ path: "admin/reservas", version: "2" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPERADOR")
export class AdminReservasController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly bookings: BookingService,
    private readonly reservas: ReservasAppService,
    private readonly integracion: IntegracionBookingService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Reservas de un día (web y Booking)" })
  @ApiResponse({ status: 200, description: "Reservas ordenadas por turno." })
  async listar(@Query() query: AdminReservasQueryDto) {
    const fecha = query.fecha ?? hoyEcuador();
    const filas = await this.bookings.porDisponibilidades(
      await this.inventory.idsDeFecha(fecha),
    );
    const vistas = await this.reservas.vistas(filas);
    const data = vistas
      .map((v) => {
        const titular = this.bookings.titular(v.reserva);
        return {
          reservation_id: v.reserva.res_uuid,
          reservation_code: v.reserva.res_codigo,
          canal: v.orden.ord_canal,
          estado: v.estado,
          atraccion: v.atraccion?.atr_nombre ?? null,
          fecha: v.turno.fecha,
          hora: v.turno.hora,
          tickets: v.reserva.res_numero_tickets,
          titular_nombre: titular?.pax_nombre ?? null,
          titular_documento: titular?.pax_documento ?? null,
          contacto_correo: v.orden.ord_contacto_correo,
          checkin_en: v.reserva.res_checkin_en?.toISOString() ?? null,
          checkin_por: v.reserva.res_checkin_guia,
        };
      })
      .sort((a, b) => a.hora.localeCompare(b.hora));
    return { fecha, data, meta: { totalItems: data.length } };
  }

  @Post(":id/checkin")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirmar la asistencia del turista",
    description:
      "Valida el documento (y el QR si se envía), emite el pase y, si la reserva vino de Booking, se lo notifica.",
  })
  @ApiParam({ name: "id", description: "UUID o código ECT-XXXXXX" })
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiResponse({ status: 200, description: "Check-in registrado." })
  @ApiResponse({
    status: 403,
    description: "IDENTITY_MISMATCH o VOUCHER_INVALID.",
  })
  @ApiResponse({ status: 404, description: "RESERVATION_NOT_FOUND." })
  @ApiResponse({
    status: 409,
    description: "Reserva no activa o check-in ya hecho.",
  })
  checkin(
    @Param("id") id: string,
    @Body() dto: AdminCheckinDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const usuario = req.user as { email?: string } | undefined;
    return this.integracion.registrarCheckin(
      id,
      dto,
      idempotencyKey?.trim() || randomUUID(),
      getCorrelationId(req),
      { cualquierCanal: true, adminId: usuario?.email ?? null },
    );
  }
}
