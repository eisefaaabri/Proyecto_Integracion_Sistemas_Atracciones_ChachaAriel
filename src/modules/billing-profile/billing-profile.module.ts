import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DatoFacturacion } from "./billing-profile.entities";
import { BillingProfileService } from "./billing-profile.service";

@Module({
  imports: [TypeOrmModule.forFeature([DatoFacturacion])],
  providers: [BillingProfileService],
  exports: [BillingProfileService],
})
export class BillingProfileModule {}
