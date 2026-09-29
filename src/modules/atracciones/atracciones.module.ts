import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtraccionesService } from './atracciones.service';
import { AtraccionesController } from './atracciones.controller';
import { Atraccion } from './entities/atraccion.entity';
import { Reservation } from './entities/reservation.entity';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Atraccion, Reservation]),
    CommonModule,
  ],
  controllers: [AtraccionesController],
  providers: [AtraccionesService],
})
export class AtraccionesModule {}
