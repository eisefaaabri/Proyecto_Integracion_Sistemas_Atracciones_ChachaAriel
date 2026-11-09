import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { IdentityModule } from "../identity/identity.module";
import { BillingProfileModule } from "../billing-profile/billing-profile.module";
import { OrderModule } from "../order/order.module";
import { BookingModule } from "../booking/booking.module";
import { InventoryModule } from "../inventory/inventory.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ClientesService } from "./clientes.service";
import { ClientesBookingController } from "./clientes-booking.controller";
import { ClientesAdminController } from "./clientes-admin.controller";

@Module({
  imports: [
    CommonModule,
    IdentityModule,
    BillingProfileModule,
    OrderModule,
    BookingModule,
    InventoryModule,
    CatalogModule,
  ],
  controllers: [ClientesBookingController, ClientesAdminController],
  providers: [ClientesService, ApiKeyGuard, RolesGuard],
  exports: [ClientesService],
})
export class ClientesModule {}
