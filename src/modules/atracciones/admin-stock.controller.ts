import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CatalogService } from "../catalog/catalog.service";
import { InventoryService } from "../inventory/inventory.service";
import { hoyEcuador } from "./booking.utils";

class StockQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;
}

// Cupo de cada atracción y turno en una fecha: el panel lo consulta cada pocos segundos
// para ver en vivo cómo bajan los cupos con las compras de la web y de Booking.
@ApiTags("Panel B2B")
@ApiBearerAuth()
@Controller({ path: "admin/stock", version: "2" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPERADOR")
export class AdminStockController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Stock por atracción y turno en una fecha" })
  @ApiQuery({
    name: "fecha",
    required: false,
    description: "YYYY-MM-DD; por defecto, hoy en Ecuador",
  })
  @ApiResponse({
    status: 200,
    description: "Cupos totales, reservados y libres.",
  })
  async stock(@Query() query: StockQueryDto) {
    const fecha = query.fecha ?? hoyEcuador();
    const atracciones = await this.catalog.listarParaStock();
    const cupos = await this.inventory.cuposDeFecha(
      atracciones.map((a) => a.atr_id),
      fecha,
    );
    const data = atracciones.map((a) => {
      const turnos = (cupos.get(a.atr_id) ?? []).map((t) => ({
        hora: t.hora,
        slot_id: `slot-${fecha.replace(/-/g, "")}-${t.hora.replace(":", "")}`,
        total: t.total,
        reservado: t.reservado,
        disponible: t.cerrada ? 0 : Math.max(t.total - t.reservado, 0),
        cerrada: t.cerrada,
      }));
      const suma = (k: "total" | "reservado" | "disponible") =>
        turnos.reduce((n, t) => n + t[k], 0);
      return {
        atraccion_id: a.atr_uuid,
        nombre: a.atr_nombre,
        estado: a.atr_estado,
        codigo_aeropuerto: a.atr_codigo_aeropuerto,
        turnos,
        totales: {
          total: suma("total"),
          reservado: suma("reservado"),
          disponible: suma("disponible"),
        },
      };
    });
    return { fecha, generado_en: new Date().toISOString(), data };
  }
}
