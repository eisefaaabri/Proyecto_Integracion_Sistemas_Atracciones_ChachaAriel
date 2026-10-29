import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  EstadoReserva,
  OutboxEvento,
  Reserva,
  ReservaPasajero,
} from "./booking.entities";
import { BookingService } from "./booking.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EstadoReserva,
      Reserva,
      ReservaPasajero,
      OutboxEvento,
    ]),
  ],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
