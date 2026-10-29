import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

// Contrato v3 de Booking (CreateReservaRequestV3) + payload de la guía de socios.
// Se aceptan los alias en español porque el contrato los declara; el servicio
// normaliza y valida los obligatorios después de resolverlos.

export enum TipoDocumento {
  CEDULA = "CEDULA",
  PASAPORTE = "PASAPORTE",
  RUC = "RUC",
}

export enum MetodoPagoBooking {
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  PAYPAL = "PAYPAL",
  TRANSFER = "TRANSFER",
}

export class BookingCustomerDto {
  @ApiPropertyOptional({ example: "María José Flores" })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  full_name?: string;

  @ApiPropertyOptional({ description: "Alias de full_name" })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  nombre_completo?: string;

  @ApiPropertyOptional({ description: "Alias de full_name (guía de socios)" })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

  @ApiPropertyOptional({ example: "turista@epn.edu.ec" })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ description: "Alias de email" })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  correo?: string;

  @ApiPropertyOptional({ example: "+593991234567" })
  @IsOptional()
  @Matches(/^\+?\d{7,15}$/, { message: "phone debe ser E.164 o 09XXXXXXXX" })
  phone?: string;

  @ApiPropertyOptional({ description: "Alias de phone" })
  @IsOptional()
  @Matches(/^\+?\d{7,15}$/, { message: "telefono debe ser E.164 o 09XXXXXXXX" })
  telefono?: string;

  @ApiPropertyOptional({ enum: TipoDocumento, default: TipoDocumento.CEDULA })
  @IsOptional()
  @IsEnum(TipoDocumento)
  document_type?: TipoDocumento;

  @ApiPropertyOptional({ enum: TipoDocumento, description: "Alias" })
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipo_documento?: TipoDocumento;

  @ApiPropertyOptional({ example: "1724589633" })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message: "document_id debe tener entre 5 y 20 caracteres alfanuméricos",
  })
  document_id?: string;

  @ApiPropertyOptional({ description: "Alias de document_id" })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message:
      "numero_documento debe tener entre 5 y 20 caracteres alfanuméricos",
  })
  numero_documento?: string;
}

export class BookingPaymentMethodDto {
  @ApiProperty({ enum: MetodoPagoBooking, example: "CREDIT_CARD" })
  @IsEnum(MetodoPagoBooking)
  method: MetodoPagoBooking;
}

export class CreateBookingReservaDto {
  @ApiPropertyOptional({ example: "3f1c2a9e-0b7d-4c55-9a51-6d2f0e8b1c44" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  attraction_id?: string;

  @ApiPropertyOptional({ description: "Alias de attraction_id" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  atraccion_id?: string;

  @ApiProperty({ example: "slot-20261125-0900" })
  @Matches(/^slot-\d{8}-\d{4}$/, {
    message: "slot_id debe tener el formato slot-YYYYMMDD-HHMM",
  })
  slot_id: string;

  @ApiPropertyOptional({ example: "2026-11-25", format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @ApiPropertyOptional({ description: "Alias de date", format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({ example: "9:00 a.m." })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  time?: string;

  @ApiPropertyOptional({ description: "Alias de time" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hora?: string;

  @ApiPropertyOptional({ example: "09:00:00" })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  time_24h?: string;

  @ApiProperty({ minimum: 1, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  adult_count: number;

  @ApiPropertyOptional({ default: 0, description: "50 % de descuento" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  child_count?: number;

  @ApiPropertyOptional({ default: 0, description: "30 % de descuento" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  senior_count?: number;

  @ApiPropertyOptional({ default: 0, description: "Sin costo, ocupa cupo" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  infant_count?: number;

  @ApiPropertyOptional({
    description: "Si se envía, debe coincidir con la suma",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  total_tickets?: number;

  @ApiProperty({ type: BookingCustomerDto })
  @ValidateNested()
  @Type(() => BookingCustomerDto)
  customer: BookingCustomerDto;

  @ApiPropertyOptional({ type: BookingPaymentMethodDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPaymentMethodDto)
  payment_method?: BookingPaymentMethodDto;

  @ApiPropertyOptional({ example: "Requiere audio-guía en inglés" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  special_requirements?: string;

  @ApiPropertyOptional({ example: "RES-ATR-A1B2C3" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  booking_reservation_id?: string;

  @ApiPropertyOptional({
    description: "Se prefiere la cabecera X-Correlation-Id",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  correlation_id?: string;

  @ApiPropertyOptional({ description: "Se usa la cabecera Idempotency-Key" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotency_key?: string;
}
