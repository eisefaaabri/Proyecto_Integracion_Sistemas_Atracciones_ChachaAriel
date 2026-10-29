import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AtraccionesService } from "./atracciones.service";
import { AtraccionesController } from "./atracciones.controller";
import { IntegracionBookingController } from "./integracion-booking.controller";
import { DisponibilidadController } from "./disponibilidad.controller";
import { InventarioBookingClient } from "./inventario-booking.client";
import { CatalogoBookingController } from "./catalogo-booking.controller";
import { CatalogoBookingService } from "./catalogo-booking.service";
import { Categoria } from "./entities/categoria.entity";
import { ContratoPromociones } from "./entities/contrato-promociones.entity";
import { OutboxEvento } from "./entities/outbox-evento.entity";
import { OutboxService } from "./outbox.service";
import { EventosController } from "./eventos.controller";
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
      Categoria,
      ContratoPromociones,
      OutboxEvento,
      Cliente,
      Reserva,
      DetalleReserva,
      Factura,
      Resena,
      Wishlist,
    ]),
    CommonModule,
  ],
  // CatalogoBookingController va primero: ver comentario en el controlador.
  controllers: [
    CatalogoBookingController,
    EventosController,
    AtraccionesController,
    IntegracionBookingController,
    DisponibilidadController,
  ],
  providers: [
    AtraccionesService,
    IntegracionBookingService,
    InventarioBookingClient,
    CatalogoBookingService,
    OutboxService,
    RolesGuard,
    ApiKeyGuard,
  ],
})
export class AtraccionesModule {}
