import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ContratoPromocion,
  ContratoPromocionDestino,
  Tarifa,
} from "./pricing.entities";
import { PricingService } from "./pricing.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tarifa,
      ContratoPromocion,
      ContratoPromocionDestino,
    ]),
  ],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
