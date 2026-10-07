import { IsUrl, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class PhotoUploadDto {
  @ApiProperty({ description: "URL de la fotografía subida" })
  @IsUrl()
  @IsNotEmpty()
  url: string;
}
