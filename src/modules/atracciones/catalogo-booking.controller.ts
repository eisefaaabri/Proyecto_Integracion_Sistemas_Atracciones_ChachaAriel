import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { CatalogoBookingService } from "./catalogo-booking.service";
import {
  ActualizarPromocionesContratoDto,
  CategoriasQueryDto,
} from "./dto/catalogo-booking.dto";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

// Debe registrarse antes que AtraccionesController: su GET :id (ParseUUIDPipe)
// capturaría /atracciones/categorias.
@ApiTags("Integración Booking (v3)")
@ApiHeader({ name: "X-Correlation-Id", required: false })
@Controller({ path: "atracciones", version: "3" })
export class CatalogoBookingController {
  constructor(private readonly service: CatalogoBookingService) {}

  @Get("categorias/arbol")
  @ApiOperation({
    summary: "Árbol de categorías con banderas de inclusión",
    description:
      "Cada nodo trae incluye_comida, incluye_transporte e incluye_guia (con alias en inglés).",
  })
  @ApiResponse({ status: 200, description: "Árbol de categorías." })
  arbol() {
    return this.service.arbolCategorias();
  }

  @Get("categorias")
  @ApiOperation({
    summary: "Categorías en lista plana",
    description:
      "Sin padre_id devuelve las raíz; con padre_id, sus hijas directas.",
  })
  @ApiResponse({ status: 200, description: "Listado plano de categorías." })
  listar(@Query() query: CategoriasQueryDto) {
    return this.service.listarCategorias(query.padre_id);
  }

  @Get("promociones/contrato")
  @UseGuards(ApiKeyGuard)
  @ApiSecurity("ApiKeyAuth")
  @ApiOperation({ summary: "Acuerdo comercial B2B de promociones y combos" })
  @ApiResponse({ status: 200, description: "Términos comerciales vigentes." })
  @ApiResponse({ status: 401, description: "X-API-Key ausente o inválida." })
  obtenerContrato() {
    return this.service.obtenerContrato();
  }

  @Put("promociones/contrato")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Responder o actualizar el cuestionario B2B de promociones",
    description:
      "Solo el ADMIN de Ecuatravel. Reemplaza el acuerdo completo y fija fecha_acuerdo en hoy.",
  })
  @ApiResponse({ status: 200, description: "Acuerdo actualizado." })
  @ApiResponse({ status: 400, description: "Validación o datos incoherentes." })
  @ApiResponse({ status: 401, description: "Sin token." })
  @ApiResponse({ status: 403, description: "El usuario no es ADMIN." })
  actualizarContrato(@Body() dto: ActualizarPromocionesContratoDto) {
    return this.service.actualizarContrato(dto);
  }
}
