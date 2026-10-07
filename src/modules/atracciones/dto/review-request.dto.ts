import { IsInt, Min, Max, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewRequestDto {
  @ApiProperty({ description: 'Calificación de la atracción (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @ApiProperty({ description: 'Comentario de la reseña', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comment: string;
}
