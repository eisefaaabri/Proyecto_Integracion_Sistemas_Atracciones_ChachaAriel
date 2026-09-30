import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtraccionesService } from './atracciones.service';
import { AtraccionesController } from './atracciones.controller';
import { Atraccion } from './entities/atraccion.entity';
import { Reservation } from './entities/reservation.entity';
import { Operator } from './entities/operator.entity';
import { Category } from './entities/category.entity';
import { Badge } from './entities/badge.entity';
import { Language } from './entities/language.entity';
import { AtraccionLocation } from './entities/atraccion-location.entity';
import { AtraccionPhoto } from './entities/atraccion-photo.entity';
import { AtraccionInclude } from './entities/atraccion-include.entity';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Atraccion,
      Reservation,
      Operator,
      Category,
      Badge,
      Language,
      AtraccionLocation,
      AtraccionPhoto,
      AtraccionInclude,
    ]),
    CommonModule,
  ],
  controllers: [AtraccionesController],
  providers: [AtraccionesService],
})
export class AtraccionesModule {}
