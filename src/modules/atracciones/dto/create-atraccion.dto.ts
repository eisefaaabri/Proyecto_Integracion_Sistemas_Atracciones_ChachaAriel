import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, IsEnum, IsArray, IsUrl, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PriceDto, LocationDto, PhotoDto, OperatorDto } from './nested-types.dto';

export enum ProductType {
  SINGLE_TICKET = 'SINGLE_TICKET',
  GUIDED_TOUR = 'GUIDED_TOUR',
  PACKAGE = 'PACKAGE'
}

export class CreateAtraccionDto {
  @ApiProperty({ description: 'Nombre de la atracción turística', example: 'Tour al Parque Nacional Cotopaxi' })
  @IsString()
  @MinLength(3)
  name: string;

  @ApiProperty({ description: 'Descripción detallada de la atracción', example: 'Excursión guiada al volcán Cotopaxi, incluye caminata hasta el refugio.' })
  @IsString()
  @MinLength(10)
  long_description: string;

  @ApiProperty({ description: 'Duración en formato ISO 8601', example: 'PT8H' })
  @IsString()
  duration: string;

  @ApiProperty({ description: 'Precio de la atracción', type: PriceDto })
  @ValidateNested()
  @Type(() => PriceDto)
  price: PriceDto;

  @ApiProperty({ description: 'Empresa operadora del tour', type: OperatorDto })
  @ValidateNested()
  @Type(() => OperatorDto)
  operator: OperatorDto;

  @ApiProperty({ description: 'Tipo de producto', enum: ProductType, example: ProductType.GUIDED_TOUR })
  @IsEnum(ProductType)
  product_type: ProductType;

  @ApiProperty({ description: 'Qué incluye el tour/paquete', example: ['Transporte', 'Guía Bilingüe', 'Almuerzo'] })
  @IsArray()
  @IsString({ each: true })
  includes: string[];

  @ApiProperty({ description: 'Categorías de la atracción', example: ['tour_guiado', 'cultural'] })
  @IsArray()
  @IsString({ each: true })
  categories: string[];

  @ApiProperty({ description: 'Insignias comerciales', example: ['best_seller'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  badges?: string[];

  @ApiProperty({ description: 'Ubicaciones del tour', type: [LocationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationDto)
  locations: LocationDto[];

  @ApiProperty({ description: 'Fotos de la atracción', type: [PhotoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos: PhotoDto[];

  @ApiProperty({ description: 'Idiomas soportados', example: ['es', 'en'] })
  @IsArray()
  @IsString({ each: true })
  supported_languages: string[];

  @ApiProperty({ description: 'Permite cancelación gratuita', example: true })
  @IsBoolean()
  free_cancellation: boolean;
}
