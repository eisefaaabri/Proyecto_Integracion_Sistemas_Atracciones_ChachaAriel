import { ApiProperty } from "@nestjs/swagger";

export class ErrorDto {
  @ApiProperty({ description: "HTTP Status Code", example: 400 })
  status: number;

  @ApiProperty({
    description: "Error Name/Type",
    example: "BadRequestException",
  })
  error: string;

  @ApiProperty({
    description: "Detailed error messages",
    example: ["ticket_count must be a positive number"],
  })
  details: string | string[];

  @ApiProperty({
    description: "Path where the error occurred",
    example: "/api/v1/atracciones",
  })
  path: string;

  @ApiProperty({
    description: "Timestamp of the error",
    example: "2026-10-04T12:00:00.000Z",
  })
  timestamp: string;
}
