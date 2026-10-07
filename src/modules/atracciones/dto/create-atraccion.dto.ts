import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  Min,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  IsEnum,
} from "class-validator";

export class CreateAtraccionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  precio_base: number;

  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  capacidad_diaria: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  codigo_aeropuerto: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  foto_url?: string;

  @ApiProperty({
    required: false,
    enum: ["ACTIVA", "INACTIVA", "MANTENIMIENTO"],
  })
  @IsEnum(["ACTIVA", "INACTIVA", "MANTENIMIENTO"])
  @IsOptional()
  estado?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  duracion_horas?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  incluye?: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  itinerario?: string;
}
