import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  EstadoOrden,
  Idempotencia,
  Orden,
  OrdenDetalle,
} from "./order.entities";
import { OrderService } from "./order.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([EstadoOrden, Orden, OrdenDetalle, Idempotencia]),
  ],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
