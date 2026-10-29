import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { TipoEventoOutbox } from "../../booking/booking.entities";

export class EventosQueryDto {
  @ApiPropertyOptional({
    default: 0,
    description: "Devuelve eventos con sequence_number mayor a este",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: TipoEventoOutbox })
  @IsOptional()
  @IsEnum(TipoEventoOutbox)
  type?: TipoEventoOutbox;
}
