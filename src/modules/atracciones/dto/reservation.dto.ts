import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsInt,
  Min,
  IsEmail,
  IsOptional,
  IsDateString,
} from "class-validator";
import { PriceDto } from "./nested-types.dto";

export class ReservationRequestDto {
  @ApiProperty({
    description: "Fecha para la reserva",
    example: "2026-10-10",
    format: "date",
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: "Hora seleccionada",
    example: "10:00",
    required: false,
  })
  @IsString()
  @IsOptional()
  time?: string;

  @ApiProperty({ description: "Cantidad de tickets", example: 2 })
  @IsInt()
  @Min(1)
  ticket_count: number;

  @ApiProperty({
    description: "Nombre completo del cliente",
    example: "Juan Perez",
  })
  @IsString()
  customer_name: string;

  @ApiProperty({
    description: "Email del cliente",
    example: "juan@example.com",
    required: false,
  })
  @IsEmail()
  @IsOptional()
  customer_email?: string;
}

export enum ReservationStatus {
  CONFIRMED = "CONFIRMED",
  PENDING = "PENDING",
  CANCELLED = "CANCELLED",
}

export class ReservationResponseDto {
  @ApiProperty({
    description: "ID único de reserva",
    format: "uuid",
    example: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  })
  reservation_id: string;

  @ApiProperty({ description: "ID de la atracción reservada", format: "uuid" })
  atraccion_id: string;

  @ApiProperty({
    description: "Estado de la reserva",
    enum: ReservationStatus,
    example: ReservationStatus.CONFIRMED,
  })
  status: ReservationStatus;

  @ApiProperty({ description: "Fecha para la reserva", example: "2026-10-10" })
  date: string;

  @ApiProperty({
    description: "Hora de la reserva",
    example: "10:00",
    required: false,
  })
  time?: string;

  @ApiProperty({
    description: "Nombre completo del cliente",
    example: "Juan Perez",
  })
  customer_name: string;

  @ApiProperty({ description: "Cantidad de tickets reservados", example: 2 })
  ticket_count: number;

  @ApiProperty({ description: "Precio total de la reserva", type: PriceDto })
  total_price: PriceDto;
}

export class CancelReservationRequestDto {
  @ApiProperty({
    description: "Razón de la cancelación",
    example: "Plan cancelado",
  })
  @IsString()
  reason: string;
}
