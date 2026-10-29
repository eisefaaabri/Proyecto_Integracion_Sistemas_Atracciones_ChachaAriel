import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CategoriasQueryDto {
  @ApiPropertyOptional({
    description: "Lista solo las hijas directas. Sin él, las categorías raíz.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  padre_id?: string;
}

export class ContactoComercialDto {
  @ApiPropertyOptional({ example: "Ariel Chacha" })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  nombre?: string;

  @ApiPropertyOptional({ example: "ventas@ecuatravel.ec" })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;
}

// PUT reemplaza el acuerdo completo: lo que no se envía queda vacío.
export class ActualizarPromocionesContratoDto {
  @ApiProperty({
    description: "¿Acepta participar en promociones y combos con Booking?",
    example: true,
  })
  @IsBoolean()
  permite_promociones: boolean;

  @ApiProperty({
    description: "Descuento máximo sobre la tarifa pública (0 a 50 %)",
    example: 15,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  porcentaje_descuento_maximo: number;

  @ApiPropertyOptional({ example: ["Quito", "Cuenca", "Galápagos"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  destinos_habilitados?: string[];

  @ApiPropertyOptional({ example: "2027-12-31", format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  vigencia_hasta?: string;

  @ApiPropertyOptional({
    example: "Paquetes de al menos 2 servicios y 48 horas de anticipación.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  condiciones_combo?: string;

  @ApiPropertyOptional({ type: ContactoComercialDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactoComercialDto)
  contacto_comercial?: ContactoComercialDto;
}
