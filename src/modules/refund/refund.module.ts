import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Reembolso } from "./refund.entities";
import { RefundService } from "./refund.service";

@Module({
  imports: [TypeOrmModule.forFeature([Reembolso])],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
