import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
}

export class AdminCheckinDto {
  @ApiProperty({
    example: "1724589633",
    description: "Documento que presenta el turista",
  })
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message:
      "documento_identidad debe tener entre 5 y 20 caracteres alfanuméricos",
  })
  documento_identidad: string;

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
