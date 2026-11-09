import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { ClientesService } from "./clientes.service";
import {
  ClienteResponseDto,
  ClientesQueryDto,
  CreateClienteDto,
} from "./dto/clientes.dto";

// Booking consulta y registra turistas antes de reservar (contrato v3.1).
@ApiTags("Integración Booking (v3)")
@Controller({ path: "clientes", version: "3" })
@UseGuards(ApiKeyGuard)
@ApiSecurity("ApiKeyAuth")
export class ClientesBookingController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({
    summary: "Consultar si un turista ya existe",
    description: "Busca por email, identificación o ambos (gana el email).",
  })
  @ApiResponse({ status: 200, type: ClienteResponseDto })
  @ApiResponse({ status: 400, description: "Sin criterios de búsqueda." })
  @ApiResponse({ status: 401, description: "X-API-Key ausente o inválida." })
  @ApiResponse({ status: 404, description: "CLIENT_NOT_FOUND." })
  buscar(@Query() query: ClientesQueryDto) {
    return this.clientes.buscar(query);
  }

  @Post()
  @ApiOperation({
    summary: "Registrar un turista creado en Booking",
    description:
      "201 si se crea. Si el email o la identificación ya existen devuelve 200 con el mismo client_id, sin duplicar.",
  })
  @ApiResponse({ status: 201, type: ClienteResponseDto })
  @ApiResponse({
    status: 200,
    description: "Ya existía.",
    type: ClienteResponseDto,
  })
  @ApiResponse({ status: 401, description: "X-API-Key ausente o inválida." })
  @ApiResponse({
    status: 409,
    description:
      "CLIENT_CONFLICT: email e identificación de turistas distintos.",
  })
  async registrar(
    @Body() dto: CreateClienteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { creado, cliente } = await this.clientes.registrar(dto);
    res.status(creado ? 201 : 200);
    return cliente;
  }
}
