import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EstadoFactura, Factura, FacturaDetalle } from "./invoicing.entities";
import { InvoicingService } from "./invoicing.service";

@Module({
  imports: [TypeOrmModule.forFeature([EstadoFactura, Factura, FacturaDetalle])],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
