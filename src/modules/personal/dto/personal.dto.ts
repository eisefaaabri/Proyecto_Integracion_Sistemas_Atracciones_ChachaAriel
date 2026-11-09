import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export const ROLES_PERSONAL = ["ADMIN", "OPERADOR"] as const;
export type RolPersonal = (typeof ROLES_PERSONAL)[number];

const recortar = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class PersonalQueryDto {
  @ApiPropertyOptional({ description: "Correo, nombre o documento" })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  q?: string;
}

export class CreatePersonalDto {
  @ApiProperty({ example: "guia.carlos@ecuatravel.com" })
  @Transform(recortar)
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiProperty({ minLength: 8, description: "Contraseña inicial" })
  @IsString()
  @Length(8, 72)
  password: string;

  @ApiProperty({ example: "Carlos Andrade" })
  @Transform(recortar)
  @IsString()
  @Length(2, 150)
  nombre_completo: string;

  @ApiProperty({ enum: ROLES_PERSONAL, example: "OPERADOR" })
  @IsIn(ROLES_PERSONAL)
  rol: RolPersonal;

  @ApiPropertyOptional({ example: "+593991234567" })
  @IsOptional()
  @Transform(recortar)
  @Matches(/^\+?\d{7,15}$/, { message: "telefono debe ser E.164 o 09XXXXXXXX" })
  telefono?: string;
}

export class CambiarRolPersonalDto {
  @ApiProperty({
    enum: ROLES_PERSONAL,
    description: "También sirve para dar acceso de personal a un cliente",
  })
  @IsIn(ROLES_PERSONAL)
  rol: RolPersonal;
}

export class CambiarEstadoPersonalDto {
  @ApiProperty({ description: "false bloquea el inicio de sesión" })
  @IsBoolean()
  activo: boolean;
}
