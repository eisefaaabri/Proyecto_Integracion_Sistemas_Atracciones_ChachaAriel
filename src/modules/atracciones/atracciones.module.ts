import { Module } from "@nestjs/common";
import { AtraccionesService } from "./atracciones.service";
import { AtraccionesController } from "./atracciones.controller";
import { IntegracionBookingController } from "./integracion-booking.controller";
import { DisponibilidadController } from "./disponibilidad.controller";
import { InventarioBookingClient } from "./inventario-booking.client";
import { CatalogoBookingController } from "./catalogo-booking.controller";
import { CatalogoBookingService } from "./catalogo-booking.service";
import { OutboxService } from "./outbox.service";
import { EventosController } from "./eventos.controller";
import { HealthController } from "./health.controller";
import { IntegracionBookingService } from "./integracion-booking.service";
import { ReservasAppService } from "./reservas-app.service";
import { DisponibilidadAppService } from "./disponibilidad-app.service";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { CommonModule } from "../../common/common.module";
import { RolesGuard } from "../auth/roles.guard";
import { IdentityModule } from "../identity/identity.module";
import { BillingProfileModule } from "../billing-profile/billing-profile.module";
import { LocationModule } from "../location/location.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ReviewModule } from "../review/review.module";
import { PricingModule } from "../pricing/pricing.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrderModule } from "../order/order.module";
import { BookingModule } from "../booking/booking.module";
import { PaymentModule } from "../payment/payment.module";
import { RefundModule } from "../refund/refund.module";
import { InvoicingModule } from "../invoicing/invoicing.module";

// Capa de aplicación de la tienda: expone la API v2/v3 y orquesta los servicios de dominio,
// cada uno dueño de su esquema (ms_*).
@Module({
  imports: [
    CommonModule,
    IdentityModule,
    BillingProfileModule,
    LocationModule,
    CatalogModule,
    ReviewModule,
    PricingModule,
    InventoryModule,
    OrderModule,
    BookingModule,
    PaymentModule,
    RefundModule,
    InvoicingModule,
  ],
  // Los controladores con rutas fijas van antes que AtraccionesController: su GET :id
  // (ParseUUIDPipe) capturaría /atracciones/categorias, /eventos y /health.
  controllers: [
    HealthController,
    CatalogoBookingController,
    EventosController,
    AtraccionesController,
    IntegracionBookingController,
    DisponibilidadController,
  ],
  providers: [
    AtraccionesService,
    IntegracionBookingService,
    ReservasAppService,
    DisponibilidadAppService,
    InventarioBookingClient,
    CatalogoBookingService,
    OutboxService,
    RolesGuard,
    ApiKeyGuard,
  ],
})
export class AtraccionesModule {}
