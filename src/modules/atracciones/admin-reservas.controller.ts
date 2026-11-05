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
import { CodigoEstadoReserva, Reserva } from "../booking/booking.entities";
import { IdentityService } from "../identity/identity.service";
import { OrderService } from "../order/order.service";
import { InventoryService } from "../inventory/inventory.service";
import { IntegracionBookingService } from "./integracion-booking.service";
import { ReservasAppService, VistaReserva } from "./reservas-app.service";
import { hoyEcuador } from "./booking.utils";
import {
  AdminCheckinDto,
  AdminReservasQueryDto,
} from "./dto/admin-checkin.dto";

const CODIGO = /^ECT-[A-Z2-9]{6}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Estado que ve el guía: una reserva confirmada espera al turista en el punto de encuentro.
function estadoAsistencia(estado: CodigoEstadoReserva): string {
  switch (estado) {
    case CodigoEstadoReserva.CONFIRMADA:
      return "PENDIENTE_ASISTENCIA";
    case CodigoEstadoReserva.CHECKED_IN:
    case CodigoEstadoReserva.COMPLETADA:
      return "CONFIRMADO_ASISTIDO";
    case CodigoEstadoReserva.CANCELADA:
      return "CANCELADA";
    default:
      return "PENDIENTE_PAGO";
  }
}

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
    private readonly orders: OrderService,
    private readonly identity: IdentityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Reservas de un día o búsqueda por código, cédula o email",
    description:
      "Con `q` busca en todas las fechas (código ECT-XXXXXX, documento del titular o email); sin `q`, lista la fecha indicada.",
  })
  @ApiResponse({
    status: 200,
    description: "Reservas ordenadas por fecha y turno.",
  })
  async listar(@Query() query: AdminReservasQueryDto) {
    const q = query.q?.trim();
    const fecha = q ? null : (query.fecha ?? hoyEcuador());
    const filas = q
      ? await this.buscar(q)
      : await this.bookings.porDisponibilidades(
          await this.inventory.idsDeFecha(fecha),
        );
    const vistas = await this.reservas.vistas(filas);
    const data = vistas
      .map((v) => this.aItem(v))
      .sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora),
      );
    return { fecha, q: q ?? null, data, meta: { totalItems: data.length } };
  }

  private async buscar(q: string): Promise<Reserva[]> {
    const valor = q.toUpperCase();
    if (CODIGO.test(valor)) {
      const reserva = await this.bookings.porCodigo(valor);
      return reserva ? [reserva] : [];
    }
    if (CORREO.test(q)) {
      const usuarios = await this.identity.buscarPorCorreoODocumento(q, null);
      const ordenes = await this.orders.porCorreo(
        q,
        usuarios.map((u) => u.usu_id),
      );
      return this.bookings.porOrdenes(ordenes.map((o) => o.ord_id));
    }
    return /^[A-Z0-9]{5,20}$/.test(valor)
      ? this.bookings.porDocumentoTitular(valor)
      : [];
  }

  private aItem(v: VistaReserva) {
    const titular = this.bookings.titular(v.reserva);
    return {
      reservation_id: v.reserva.res_uuid,
      reservation_code: v.reserva.res_codigo,
      external_order_id: v.orden.ord_numero,
      canal: v.orden.ord_canal,
      estado: v.estado,
      estado_asistencia: estadoAsistencia(v.estado),
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
  }

  @Post(":id/checkin")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirmar la asistencia del turista",
    description:
      "Registra la llegada (CONFIRMADO_ASISTIDO), emite el pase y, si la reserva vino de Booking, se lo notifica. El documento y el QR son opcionales; si se envían deben coincidir.",
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
