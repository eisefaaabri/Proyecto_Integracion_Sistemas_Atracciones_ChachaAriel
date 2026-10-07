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
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AtraccionesService } from './atracciones.service';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { ReviewRequestDto } from './dto/review-request.dto';
import { PaymentRequestDto } from './dto/payment-request.dto';
import { PhotoUploadDto } from './dto/photo-upload.dto';

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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Catálogo')
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiTags('Reservas')
  @ApiOperation({ summary: 'Historial de reservas del usuario' })
  @ApiResponse({
    status: 200,
    description: 'Listado de reservas.',
    type: [ReservationResponseDto],
  })
  async getReservations() {
    return this.atraccionesService.getReservations({});
  }

  @Get('reservations/:reservationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiTags('Reservas')
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
  @UseGuards(JwtAuthGuard, IdempotencyKeyGuard)
  @ApiBearerAuth()
  @ApiTags('Reservas')
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard, IdempotencyKeyGuard)
  @ApiBearerAuth()
  @ApiTags('Reservas')
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
    @Req() req: Request,
  ) {
    const usuarioId = (req.user as any).userId;
    return this.atraccionesService.reserve(id, usuarioId, idempotencyKey, reservationDto);
  }

  // ==========================================
  // REVIEWS & SOCIAL PROOF
  // ==========================================
  @ApiTags('Reseñas')
  @ApiOperation({ summary: 'Dejar una reseña sobre una atracción' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID de la atracción' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/reviews')
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewRequestDto,
    @Req() req: Request,
  ) {
    const usuarioId = (req.user as any).userId;
    return this.atraccionesService.createReview(id, usuarioId, body.score, body.comment);
  }

  @ApiTags('Reseñas')
  @ApiOperation({ summary: 'Obtener reseñas de una atracción' })
  @Get(':id/reviews')
  async getReviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.atraccionesService.getReviews(id);
  }

  // ==========================================
  // MULTIMEDIA / IMAGES
  // ==========================================
  @ApiTags('Catálogo')
  @ApiOperation({ summary: 'Subir fotografía para la atracción (Multipart)' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/photos')
  async uploadPhoto(@Param('id', ParseUUIDPipe) id: string, @Body() body: PhotoUploadDto) {
    return this.atraccionesService.updatePhoto(id, body.url);
  }

  // ==========================================
  // WISHLIST / FAVORITOS
  // ==========================================
  @ApiTags('Wishlist')
  @ApiOperation({ summary: 'Añadir atracción a favoritos' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('/users/me/wishlist/:atraccionId')
  @HttpCode(HttpStatus.CREATED)
  async addToWishlist(
    @Param('atraccionId', ParseUUIDPipe) atraccionId: string,
    @Req() req: Request,
  ) {
    const usuarioId = (req.user as any).userId;
    return this.atraccionesService.addToWishlist(usuarioId, atraccionId);
  }

  @ApiTags('Wishlist')
  @ApiOperation({ summary: 'Eliminar atracción de favoritos' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('/users/me/wishlist/:atraccionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWishlist(
    @Param('atraccionId', ParseUUIDPipe) atraccionId: string,
    @Req() req: Request,
  ) {
    const usuarioId = (req.user as any).userId;
    return this.atraccionesService.removeFromWishlist(usuarioId, atraccionId);
  }

  // ==========================================
  // PAYMENTS / PAGOS
  // ==========================================
  @ApiTags('Pagos')
  @ApiOperation({ summary: 'Procesar el pago de una reserva' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('/reservations/:reservationId/pay')
  async processPayment(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() body: PaymentRequestDto,
  ) {
    return this.atraccionesService.processPayment(reservationId, body.card_token, body.method);
  }
}
