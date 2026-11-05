import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

const recortar = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

// Booking consulta y registra turistas antes de reservar (contrato v3.1).
export class ClientesQueryDto {
  @ApiPropertyOptional({ example: "turista@epn.edu.ec" })
  @IsOptional()
  @Transform(recortar)
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({
    example: "1724589633",
    description: "Cédula, RUC o pasaporte",
  })
  @IsOptional()
  @Transform(recortar)
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message: "identificacion debe tener entre 5 y 20 caracteres alfanuméricos",
  })
  identificacion?: string;
}

export class CreateClienteDto {
  @ApiProperty({ example: "María José Flores" })
  @Transform(recortar)
  @IsString()
  @Length(2, 150)
  nombre: string;

  @ApiProperty({ example: "turista@epn.edu.ec" })
  @Transform(recortar)
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiProperty({
    example: "1724589633",
    description: "Cédula, RUC o pasaporte",
  })
  @Transform(recortar)
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message: "identificacion debe tener entre 5 y 20 caracteres alfanuméricos",
  })
  identificacion: string;

  @ApiPropertyOptional({ example: "+593991234567" })
  @IsOptional()
  @Transform(recortar)
  @Matches(/^\+?\d{7,15}$/, { message: "telefono debe ser E.164 o 09XXXXXXXX" })
  telefono?: string;
}

export class ClienteResponseDto {
  @ApiProperty({ format: "uuid" })
  client_id: string;

  @ApiProperty({ example: "María José Flores" })
  nombre: string;

  @ApiProperty({ example: "turista@epn.edu.ec" })
  email: string;

  @ApiProperty({ example: "1724589633", nullable: true })
  identificacion: string | null;

  @ApiProperty({ example: "+593991234567", nullable: true })
  telefono: string | null;
}
