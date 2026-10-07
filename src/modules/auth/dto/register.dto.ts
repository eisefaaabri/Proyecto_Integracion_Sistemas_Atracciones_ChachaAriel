import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "juan@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: "ClaveSegura123!" })
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: "Juan Pérez" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre_completo: string;

  @ApiProperty({ example: "1723456789" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7,20}$/, {
    message: "El DNI solo debe contener dígitos (7-20 caracteres)",
  })
  dni: string;

  @ApiProperty({ example: "+593987654321", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;
}