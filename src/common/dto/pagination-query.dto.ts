import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: "Página actual", default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Elementos por página",
    default: 10,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Búsqueda por nombre, descripción o aeropuerto (case-insensitive)",
    example: "Quito",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Filtrar por código de aeropuerto (ej. UIO, GYE)",
    example: "UIO",
  })
  @IsOptional()
  @IsString()
  aeropuerto?: string;
}
