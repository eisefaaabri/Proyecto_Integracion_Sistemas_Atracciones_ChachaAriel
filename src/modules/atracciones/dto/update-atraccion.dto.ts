import { PartialType } from '@nestjs/swagger';
import { CreateAtraccionDto } from './create-atraccion.dto';

export class UpdateAtraccionDto extends PartialType(CreateAtraccionDto) {}
