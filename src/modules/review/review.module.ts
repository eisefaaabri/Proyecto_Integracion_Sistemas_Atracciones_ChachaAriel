import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Resena } from "./review.entities";
import { ReviewService } from "./review.service";

@Module({
  imports: [TypeOrmModule.forFeature([Resena])],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
