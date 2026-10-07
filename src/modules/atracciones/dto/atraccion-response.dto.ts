import { ApiProperty } from "@nestjs/swagger";

export class AtraccionResponseDto {
  @ApiProperty({ format: "uuid" })
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

  @ApiProperty({ required: false })
  foto_url?: string;

  @ApiProperty({ required: false })
  estado?: string;

  @ApiProperty({ required: false })
  duracion_horas?: number;

  @ApiProperty({ required: false, type: [String] })
  incluye?: string[];

  @ApiProperty({ required: false })
  itinerario?: string;
}
