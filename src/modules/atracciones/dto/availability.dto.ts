import { ApiProperty } from "@nestjs/swagger";

export class AvailabilitySlotDto {
  @ApiProperty({ description: "Hora de inicio del turno", example: "09:00" })
  time: string;

  @ApiProperty({ description: "Cupos libres en este turno", example: 29 })
  available_spots: number;
}

export class AvailabilityResponseDto {
  @ApiProperty({
    description: "Fecha de disponibilidad",
    example: "2026-10-10",
    format: "date",
  })
  date: string;

  @ApiProperty({
    description: "Máximo de cupos libres en un solo turno",
    example: 45,
  })
  available_spots: number;

  @ApiProperty({
    description: "Horarios de inicio disponibles",
    example: ["10:00", "14:00"],
  })
  times: string[];

  @ApiProperty({
    description: "Cupos libres por turno (cada turno tiene su propio cupo)",
    type: [AvailabilitySlotDto],
  })
  slots: AvailabilitySlotDto[];
}
