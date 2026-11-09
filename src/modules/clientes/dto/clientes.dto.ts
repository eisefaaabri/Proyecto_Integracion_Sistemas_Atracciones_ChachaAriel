import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const recortar = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

// Listado de clientes en el panel (v2).
export class ClientesAdminQueryDto {
  @ApiPropertyOptional({ description: "Correo, nombre, apellido o documento" })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

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

// Alta desde el panel (p. ej., un turista que reserva en mostrador).
export class CreateClienteAdminDto extends CreateClienteDto {
  @ApiPropertyOptional({
    minLength: 8,
    description:
      "Contraseña inicial para que el cliente inicie sesión en la web; sin ella la cuenta solo agrupa sus reservas",
  })
  @IsOptional()
  @IsString()
  @Length(8, 72)
  password?: string;
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
