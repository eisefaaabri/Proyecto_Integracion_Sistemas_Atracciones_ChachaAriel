import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { RolUsuario } from "../entities/usuario.entity";

export class CreateUserDto {
  @ApiProperty({ example: "admin.soporte@ecuatravel.com" })
  @IsEmail({}, { message: "Debe ingresar un correo electrónico válido" })
  @IsNotEmpty({ message: "El correo es requerido" })
  email: string;

  @ApiProperty({ example: "ClaveSegura123!" })
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: RolUsuario, default: RolUsuario.ADMIN })
  @IsOptional()
  @IsEnum(RolUsuario, { message: "El rol debe ser ADMIN o TURISTA" })
  rol?: RolUsuario;

  @ApiProperty({ example: "Carlos Administrador", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_completo?: string;

  @ApiProperty({ example: "1723456789", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7,20}$/, {
    message: "El DNI solo debe contener dígitos (7-20 caracteres)",
  })
  dni?: string;

  @ApiProperty({ example: "+593987654321", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;
}
