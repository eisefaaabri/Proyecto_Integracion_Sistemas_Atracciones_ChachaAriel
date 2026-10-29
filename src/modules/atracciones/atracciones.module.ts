import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AtraccionesService } from "./atracciones.service";
import { AtraccionesController } from "./atracciones.controller";
import { IntegracionBookingController } from "./integracion-booking.controller";
import { DisponibilidadController } from "./disponibilidad.controller";
import { InventarioBookingClient } from "./inventario-booking.client";
import { IntegracionBookingService } from "./integracion-booking.service";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { Atraccion } from "./entities/atraccion.entity";
import { Cliente } from "./entities/cliente.entity";
import { Reserva } from "./entities/reserva.entity";
import { DetalleReserva } from "./entities/detalle-reserva.entity";
import { Factura } from "./entities/factura.entity";
import { Resena } from "./entities/resena.entity";
import { Wishlist } from "./entities/wishlist.entity";
import { CommonModule } from "../../common/common.module";
import { RolesGuard } from "../auth/roles.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Atraccion,
      Cliente,
      Reserva,
      DetalleReserva,
      Factura,
      Resena,
      Wishlist,
    ]),
    CommonModule,
  ],
  controllers: [
    AtraccionesController,
    IntegracionBookingController,
    DisponibilidadController,
  ],
  providers: [
    AtraccionesService,
    IntegracionBookingService,
    InventarioBookingClient,
    RolesGuard,
    ApiKeyGuard,
  ],
})
export class AtraccionesModule {}
