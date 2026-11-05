import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class AdminReservasQueryDto {
  @ApiPropertyOptional({
    example: "2026-11-05",
    description: "Fecha del tour; por defecto, hoy en Ecuador",
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({
    example: "ECT-7KQ2M9",
    description:
      "Código de reserva, cédula/pasaporte o email del turista (busca en todas las fechas)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;
}

export class AdminCheckinDto {
  @ApiPropertyOptional({
    example: "1724589633",
    description:
      "Documento que presenta el turista; si se envía debe ser el del titular",
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message:
      "documento_identidad debe tener entre 5 y 20 caracteres alfanuméricos",
  })
  documento_identidad?: string;

  @ApiPropertyOptional({
    description: "Código de reserva (ECT-XXXXXX) o contenido del QR",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  codigo_voucher_qr?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  asistentes_reales?: number;

  @ApiPropertyOptional({ example: "Llegaron 2 de 3 pasajeros" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
