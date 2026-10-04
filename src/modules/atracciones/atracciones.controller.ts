import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  ParseUUIDPipe,
  Res,
  HttpCode,
  HttpStatus,
  Query,
  Header,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AtraccionesService } from './atracciones.service';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { AtraccionResponseDto } from './dto/atraccion-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { SearchAtraccionesDto } from './dto/search-atracciones.dto';
import { SearchAtraccionesResponseDto } from './dto/search-response.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import {
  ReservationRequestDto,
  ReservationResponseDto,
  CancelReservationRequestDto,
} from './dto/reservation.dto';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { ErrorDto } from '../../common/dto/error.dto';

@ApiTags('Atracciones - Catálogo')
@Controller('atracciones')
export class AtraccionesController {
  constructor(private readonly atraccionesService: AtraccionesService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  CATÁLOGO — Búsqueda y Detalle
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Búsqueda de atracciones con filtros complejos' })
  @ApiResponse({
    status: 200,
    description: 'Resultados de la búsqueda.',
    type: SearchAtraccionesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.', type: ErrorDto })
  async search(@Body() searchDto: SearchAtraccionesDto) {
    return this.atraccionesService.search(searchDto);
  }

  @Post('details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener detalles estáticos de múltiples atracciones (Batch)',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalles de atracciones en los idiomas solicitados.',
    type: SearchAtraccionesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.', type: ErrorDto })
  async getDetailsBatch(@Body() dto: DetailsRequestDto) {
    return this.atraccionesService.getDetailsBatch(dto);
  }

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck del microservicio' })
  @ApiResponse({ status: 200, description: 'Servicio de atracciones operativo.' })
  checkHealth() {
    return { status: 'UP', timestamp: new Date().toISOString() };
  }

  @Get('reservations')
  @ApiTags('Atracciones - Reservas')
  @ApiOperation({ summary: 'Historial de reservas del usuario' })
  @ApiResponse({
    status: 200,
    description: 'Listado de reservas.',
    type: [ReservationResponseDto],
  })
  async getReservations() {
    return this.atraccionesService.getReservations();
  }

  @Get('reservations/:reservationId')
  @ApiTags('Atracciones - Reservas')
  @ApiOperation({ summary: 'Obtener detalle de una reserva específica' })
  @ApiParam({
    name: 'reservationId',
    description: 'UUID de la reserva',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la reserva.',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.', type: ErrorDto })
  async getReservationById(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    return this.atraccionesService.getReservationById(reservationId);
  }

  @Post('reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @ApiTags('Atracciones - Reservas')
  @ApiOperation({ summary: 'Cancelar una reserva existente' })
  @ApiParam({
    name: 'reservationId',
    description: 'UUID de la reserva a cancelar',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Cancelación procesada.',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.', type: ErrorDto })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.', type: ErrorDto })
  @ApiResponse({ status: 409, description: 'Conflicto de idempotencia.' })
  async cancelReservation(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CancelReservationRequestDto,
  ) {
    return this.atraccionesService.cancelReservation(
      reservationId,
      dto,
      idempotencyKey,
    );
  }

  @Get()
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @Header('Cache-Control', 'max-age=300')
  @ApiOperation({ summary: 'Obtener el listado paginado de atracciones' })
  @ApiResponse({
    status: 200,
    description: 'Listado de atracciones recuperado exitosamente.',
    type: PaginatedResponseDto,
  })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.atraccionesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una nueva atracción' })
  @ApiResponse({
    status: 201,
    description: 'La atracción ha sido creada exitosamente.',
    type: AtraccionResponseDto,
    headers: {
      Location: {
        description: 'URI del nuevo recurso creado',
        schema: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.', type: ErrorDto })
  async create(
    @Body() createAtraccionDto: CreateAtraccionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const atraccion = await this.atraccionesService.create(createAtraccionDto);
    res.setHeader('Location', `/api/v1/atracciones/${atraccion.id}`);
    return atraccion;
  }

  @Get(':id')
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @Header('Cache-Control', 'max-age=300')
  @ApiOperation({ summary: 'Obtener el detalle de una atracción' })
  @ApiParam({
    name: 'id',
    description: 'UUID de la atracción',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la atracción.',
    type: AtraccionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.', type: ErrorDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.atraccionesService.findOne(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar datos completos de una atracción' })
  @ApiParam({
    name: 'id',
    description: 'UUID de la atracción',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Reemplazo exitoso sin contenido de respuesta.' })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.', type: ErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.', type: ErrorDto })
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAtraccionDto,
  ) {
    await this.atraccionesService.replace(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente una atracción' })
  @ApiParam({
    name: 'id',
    description: 'UUID de la atracción',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Actualización exitosa.',
    type: AtraccionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.', type: ErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.', type: ErrorDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAtraccionDto,
  ) {
    return this.atraccionesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una atracción' })
  @ApiParam({
    name: 'id',
    description: 'UUID de la atracción',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Eliminación exitosa sin contenido.' })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.', type: ErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.atraccionesService.remove(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Consultar disponibilidad de cupos' })
  @ApiParam({
    name: 'id',
    description: 'UUID de la atracción',
    type: 'string',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'date',
    description: 'Fecha para consultar disponibilidad (YYYY-MM-DD)',
    required: true,
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Disponibilidad recuperada exitosamente.',
    type: AvailabilityResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.', type: ErrorDto })
  async getAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
  ) {
    return this.atraccionesService.getAvailability(id, date);
  }

  @Post(':id/reservations')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(IdempotencyKeyGuard)
  @ApiTags('Atracciones - Reservas')
  @ApiOperation({ summary: 'Crear una reserva de la atracción' })
  @ApiParam({
    name: 'id',
    description: 'UUID de la atracción',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Reserva confirmada.',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.', type: ErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.', type: ErrorDto })
  @ApiResponse({ status: 409, description: 'Conflicto de idempotencia.' })
  async reserve(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() reservationDto: ReservationRequestDto,
  ) {
    return this.atraccionesService.reserve(id, reservationDto, idempotencyKey);
  }
}
