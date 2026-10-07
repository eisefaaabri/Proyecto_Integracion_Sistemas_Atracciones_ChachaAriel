import { ApiProperty } from '@nestjs/swagger';

export class AtraccionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  descripcion: string;

  @ApiProperty()
  precio_base: number;

  @ApiProperty()
  capacidad_diaria: number;

  @ApiProperty()
  codigo_aeropuerto: string;
}
