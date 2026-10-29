import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { OutboxService } from "./outbox.service";
import { EventosQueryDto } from "./dto/eventos.dto";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";

// Igual que CatalogoBookingController: debe registrarse antes que AtraccionesController.
@ApiTags("Integración Booking (v3)")
@Controller({ path: "atracciones", version: "3" })
export class EventosController {
  constructor(private readonly outbox: OutboxService) {}

  @Get("eventos")
  @UseGuards(ApiKeyGuard)
  @ApiSecurity("ApiKeyAuth")
  @ApiHeader({ name: "X-Correlation-Id", required: false })
  @ApiOperation({
    summary: "Feed de eventos de integración (Transactional Outbox)",
    description:
      "Eventos CloudEvents 1.0 en orden de sequence_number. Para leer en lotes, " +
      "pase en `after` el último sequence_number recibido.",
  })
  @ApiResponse({ status: 200, description: "Lote de eventos." })
  @ApiResponse({ status: 401, description: "X-API-Key ausente o inválida." })
  listar(@Query() query: EventosQueryDto) {
    return this.outbox.listar(query.after ?? 0, query.limit ?? 50, query.type);
  }
}
