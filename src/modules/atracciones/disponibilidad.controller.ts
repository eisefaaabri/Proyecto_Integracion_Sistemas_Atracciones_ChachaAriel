import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { DisponibilidadAppService } from "./disponibilidad-app.service";
import { DisponibilidadQueryDto } from "./dto/booking-reserva.dto";

// Público según el contrato (security: []), igual que el catálogo.
@ApiTags("Integración Booking (v3)")
@Controller({ path: "atracciones", version: "3" })
export class DisponibilidadController {
  constructor(private readonly service: DisponibilidadAppService) {}

  @Get(":id/disponibilidad")
  @ApiOperation({
    summary: "Turnos horarios y cupos disponibles para una fecha",
    description:
      "Cada turno tiene su propio cupo; total_available_slots es la suma de los turnos. " +
      "Estados: DISPONIBLE, ULTIMOS_CUPOS (3 o menos) y AGOTADO.",
  })
  @ApiParam({ name: "id", description: "UUID de la atracción" })
  @ApiHeader({ name: "X-Correlation-Id", required: false })
  @ApiResponse({ status: 200, description: "Turnos del día." })
  @ApiResponse({ status: 400, description: "Falta date o no es YYYY-MM-DD." })
  @ApiResponse({ status: 404, description: "ATTRACTION_NOT_FOUND." })
  disponibilidad(
    @Param("id") id: string,
    @Query() query: DisponibilidadQueryDto,
  ) {
    return this.service.consultarDisponibilidad(id, query);
  }
}
