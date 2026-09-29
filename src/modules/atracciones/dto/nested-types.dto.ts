import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsPositive, Min, IsUrl, IsLatitude, IsLongitude, ValidateNested, IsOptional, IsInt, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PriceDto {
  @ApiProperty({ description: 'Código de moneda IATA', example: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Monto total', example: 45.00 })
  @IsNumber()
  @IsPositive()
  total: number;
}

export class PhotoDto {
  @ApiProperty({ description: 'URL de la foto', example: 'https://cf.bstatic.com/xdata/images/xphoto/500x375/170335205.jpg' })
  @IsUrl()
  url: string;
}

export class CoordinatesDto {
  @ApiProperty({ description: 'Latitud', example: -0.680556 })
  @IsLatitude()
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Longitud', example: -78.437778 })
  @IsLongitude()
  @IsNumber()
  longitude: number;
}

export class LocationDto {
  @ApiProperty({ description: 'Dirección física', example: 'Stadhouderskade 78' })
  @IsString()
  address: string;

  @ApiProperty({ description: 'ID numérico de la ciudad', example: -2140479 })
  @IsInt()
  city: number;

  @ApiProperty({ description: 'Código ISO de país', example: 'ec' })
  @IsString()
  country: string;

  @ApiProperty({ description: 'Coordenadas', type: CoordinatesDto })
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates: CoordinatesDto;

  @ApiProperty({ description: 'Tipo de locación', example: 'attraction', required: false })
  @IsString()
  @IsOptional()
  type?: string;
}

export class RatingDto {
  @ApiProperty({ description: 'Número de reseñas', example: 3250 })
  @IsInt()
  @Min(0)
  number_of_reviews: number;

  @ApiProperty({ description: 'Puntuación promedio', example: 4.8 })
  @IsNumber()
  @Min(0)
  @Max(5)
  score: number;
}

export class OperatorDto {
  @ApiProperty({ description: 'ID de la empresa/proveedor', example: 123 })
  @IsInt()
  id: number;

  @ApiProperty({ description: 'Nombre de la empresa operadora', example: 'Quito Tour Bus' })
  @IsString()
  name: string;
}

export class UrlDto {
  @ApiProperty({ description: 'URL web', example: 'https://www.booking.com/attractions/nl/prahazwttraa-heineken-experience-amsterdam.en-gb.html' })
  @IsString()
  web: string;

  @ApiProperty({ description: 'URL para App (Deep Link)', example: 'booking://attractions/product?slug=prahazwttraa', required: false })
  @IsString()
  @IsOptional()
  app?: string;
}

