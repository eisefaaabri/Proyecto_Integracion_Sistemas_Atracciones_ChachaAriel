import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Aeropuerto, Ciudad, Provincia } from "./location.entities";
import { LocationService } from "./location.service";

@Module({
  imports: [TypeOrmModule.forFeature([Provincia, Ciudad, Aeropuerto])],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
