import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ClientesService } from "./clientes.service";
import {
  ClientesAdminQueryDto,
  CreateClienteAdminDto,
} from "./dto/clientes.dto";

// Clientes en el panel: solo turistas; el personal está en /admin/personal.
@ApiTags("Panel · Clientes")
@ApiBearerAuth()
@Controller({ path: "admin/clientes", version: "2" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPERADOR")
export class ClientesAdminController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({
    summary: "Listar clientes con su facturación y conteo de reservas",
  })
  @ApiResponse({ status: 200, description: "Página de clientes." })
  @ApiResponse({ status: 403, description: "Solo ADMIN u OPERADOR." })
  listar(@Query() query: ClientesAdminQueryDto) {
    return this.clientes.listar(query);
  }

  @Post()
  @ApiOperation({
    summary: "Registrar un cliente desde el panel",
    description:
      "Crea el turista con rol CLIENTE y su perfil de facturación. Con password puede iniciar sesión en la web.",
  })
  @ApiResponse({ status: 201, description: "Ficha del cliente creado." })
  @ApiResponse({
    status: 409,
    description: "CLIENT_CONFLICT: email o identificación ya registrados.",
  })
  crear(@Body() dto: CreateClienteAdminDto, @Req() req: Request) {
    return this.clientes.crearDesdePanel(
      dto,
      (req.user as { userId: string }).userId,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary: "Detalle del cliente: perfiles de facturación y reservas",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, description: "Ficha del cliente." })
  @ApiResponse({ status: 404, description: "CLIENT_NOT_FOUND." })
  detalle(@Param("id") id: string) {
    return this.clientes.detalle(id);
  }
}
