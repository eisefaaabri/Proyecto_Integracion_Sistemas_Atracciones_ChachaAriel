import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Disponibilidad, FechaBloqueada, Horario } from "./inventory.entities";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Horario, Disponibilidad, FechaBloqueada]),
  ],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
