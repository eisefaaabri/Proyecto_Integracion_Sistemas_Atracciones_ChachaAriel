import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, IsNull, Not, Repository } from "typeorm";
import {
  CodigoEstadoPago,
  CodigoMetodoPago,
  EstadoPago,
  MetodoPago,
  Pago,
} from "./payment.entities";

@Injectable()
export class PaymentService {
  private estados: Map<CodigoEstadoPago, number> | null = null;
  private metodos: Map<CodigoMetodoPago, number> | null = null;

  constructor(
    @InjectRepository(Pago) private readonly pagos: Repository<Pago>,
    @InjectRepository(EstadoPago)
    private readonly estadosRepo: Repository<EstadoPago>,
    @InjectRepository(MetodoPago)
    private readonly metodosRepo: Repository<MetodoPago>,
  ) {}

  async metodoId(codigo: CodigoMetodoPago): Promise<number> {
    if (!this.metodos) {
      const filas = await this.metodosRepo.find();
      this.metodos = new Map(filas.map((m) => [m.mpa_codigo, m.mpa_id]));
    }
    return this.metodos.get(codigo);
  }

  private async estadoId(codigo: CodigoEstadoPago): Promise<number> {
    if (!this.estados) {
      const filas = await this.estadosRepo.find();
      this.estados = new Map(filas.map((e) => [e.est_codigo, e.est_id]));
    }
    return this.estados.get(codigo);
  }

  // Métodos de la API (web y Booking) → catálogo de métodos de pago.
  codigoMetodo(metodo: string | null | undefined): CodigoMetodoPago {
    switch (metodo) {
      case "PAYPAL":
        return CodigoMetodoPago.PAYPAL;
      case "TRANSFER":
        return CodigoMetodoPago.TRANSFERENCIA;
      case "CREDIT_CARD":
      case "DEBIT_CARD":
        return CodigoMetodoPago.TARJETA;
      default:
        return CodigoMetodoPago.BOOKING;
    }
  }

  aprobado(ordId: number, manager?: EntityManager): Promise<Pago | null> {
    return (manager ?? this.pagos.manager).findOne(Pago, {
      where: { ord_id: ordId, pag_aprobado_en: Not(IsNull()) },
    });
  }

  async aprobadosDe(ordIds: number[]): Promise<Map<number, Pago>> {
    if (!ordIds.length) return new Map();
    const filas = await this.pagos.find({
      where: { ord_id: In(ordIds), pag_aprobado_en: Not(IsNull()) },
    });
    return new Map(filas.map((p) => [p.ord_id, p]));
  }

  async registrarAprobado(
    d: {
      numero: string;
      ordId: number;
      metodo: CodigoMetodoPago;
      monto: number;
      referencia: string | null;
      comprobanteUrl?: string | null;
    },
    manager: EntityManager,
  ): Promise<Pago> {
    const ahora = new Date();
    const { identifiers } = await manager.insert(Pago, {
      pag_numero: d.numero,
      ord_id: d.ordId,
      mpa_id: await this.metodoId(d.metodo),
      est_id: await this.estadoId(CodigoEstadoPago.APROBADO),
      pag_monto: d.monto,
      pag_referencia: d.referencia,
      pag_comprobante_url: d.comprobanteUrl ?? null,
      pag_aprobado_en: ahora,
    });
    return manager.findOneOrFail(Pago, {
      where: { pag_id: Number(identifiers[0].pag_id) },
    });
  }
}
