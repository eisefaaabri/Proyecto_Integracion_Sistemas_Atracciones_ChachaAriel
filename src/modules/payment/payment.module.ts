import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EstadoPago, MetodoPago, Pago } from "./payment.entities";
import { PaymentService } from "./payment.service";

@Module({
  imports: [TypeOrmModule.forFeature([EstadoPago, MetodoPago, Pago])],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
