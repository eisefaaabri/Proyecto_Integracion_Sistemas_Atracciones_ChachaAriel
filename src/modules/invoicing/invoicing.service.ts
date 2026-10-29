import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import {
  CodigoEstadoFactura,
  EstadoFactura,
  Factura,
  FacturaDetalle,
} from "./invoicing.entities";

export interface Comprador {
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  correo: string;
  telefono: string | null;
  dfaId?: number | null;
}

export interface LineaFactura {
  detId: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

@Injectable()
export class InvoicingService {
  private estados: Map<CodigoEstadoFactura, number> | null = null;

  constructor(
    @InjectRepository(Factura) private readonly facturas: Repository<Factura>,
    @InjectRepository(EstadoFactura)
    private readonly estadosRepo: Repository<EstadoFactura>,
  ) {}

  private async estadoId(codigo: CodigoEstadoFactura): Promise<number> {
    if (!this.estados) {
      const filas = await this.estadosRepo.find();
      this.estados = new Map(filas.map((e) => [e.est_codigo, e.est_id]));
    }
    return this.estados.get(codigo);
  }

  async emitir(
    d: {
      ordId: number;
      numero: string;
      estado: CodigoEstadoFactura;
      comprador: Comprador;
      lineas: LineaFactura[];
    },
    manager: EntityManager,
  ): Promise<void> {
    const total =
      Math.round(d.lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
    const { identifiers } = await manager.insert(Factura, {
      ord_id: d.ordId,
      dfa_id: d.comprador.dfaId ?? null,
      fac_numero: d.numero,
      est_id: await this.estadoId(d.estado),
      fac_subtotal: total,
      fac_total: total,
      fac_tipo_identificacion: d.comprador.tipoIdentificacion,
      fac_identificacion: d.comprador.identificacion,
      fac_razon_social: d.comprador.razonSocial.slice(0, 150),
      fac_correo: d.comprador.correo,
      fac_telefono:
        d.comprador.telefono && /^\+?[0-9]{7,15}$/.test(d.comprador.telefono)
          ? d.comprador.telefono
          : null,
    });
    const facId = Number(identifiers[0].fac_id);
    for (const l of d.lineas) {
      await manager.insert(FacturaDetalle, {
        fac_id: facId,
        det_id: l.detId,
        fde_codigo: l.codigo.slice(0, 25),
        fde_descripcion: l.descripcion.slice(0, 300),
        fde_cantidad: l.cantidad,
        fde_precio_unitario: l.precio,
        fde_subtotal: l.subtotal,
        fde_total: l.subtotal,
      });
    }
  }

  async cambiarEstado(
    ordId: number,
    codigo: CodigoEstadoFactura,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      Factura,
      { ord_id: ordId },
      { est_id: await this.estadoId(codigo) },
    );
  }

  deOrden(ordId: number, manager?: EntityManager): Promise<Factura | null> {
    return (manager ?? this.facturas.manager).findOne(Factura, {
      where: { ord_id: ordId },
    });
  }
}
