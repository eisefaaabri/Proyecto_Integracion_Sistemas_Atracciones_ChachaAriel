import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { PersonalService } from "./personal.service";
import {
  CambiarEstadoPersonalDto,
  CambiarRolPersonalDto,
  CreatePersonalDto,
  PersonalQueryDto,
} from "./dto/personal.dto";

const actor = (req: Request) => (req.user as { userId: string }).userId;

@ApiTags("Panel · Personal")
@ApiBearerAuth()
@Controller({ path: "admin/personal", version: "2" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class PersonalController {
  constructor(private readonly personal: PersonalService) {}

  @Get()
  @ApiOperation({ summary: "Listar administradores y operadores" })
  listar(@Query() query: PersonalQueryDto) {
    return this.personal.listar(query);
  }

  @Post()
  @ApiOperation({ summary: "Crear una cuenta de personal (ADMIN u OPERADOR)" })
  @ApiResponse({ status: 201, description: "Cuenta creada." })
  @ApiResponse({ status: 409, description: "El email ya está registrado." })
  crear(@Body() dto: CreatePersonalDto, @Req() req: Request) {
    return this.personal.crear(dto, actor(req));
  }

  @Patch(":id/rol")
  @ApiOperation({
    summary: "Cambiar el rol (ADMIN/OPERADOR) o dar acceso a un cliente",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 403, description: "No puedes modificar tu cuenta." })
  @ApiResponse({ status: 409, description: "Debe quedar un ADMIN activo." })
  cambiarRol(
    @Param("id") id: string,
    @Body() dto: CambiarRolPersonalDto,
    @Req() req: Request,
  ) {
    return this.personal.cambiarRol(id, dto.rol, actor(req));
  }

  @Patch(":id/estado")
  @ApiOperation({ summary: "Activar o desactivar el inicio de sesión" })
  @ApiParam({ name: "id", format: "uuid" })
  cambiarEstado(
    @Param("id") id: string,
    @Body() dto: CambiarEstadoPersonalDto,
    @Req() req: Request,
  ) {
    return this.personal.cambiarEstado(id, dto.activo, actor(req));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Quitar el acceso de personal (la cuenta queda como cliente)",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 204, description: "Acceso retirado." })
  async quitarAcceso(@Param("id") id: string, @Req() req: Request) {
    await this.personal.quitarAcceso(id, actor(req));
  }
}
