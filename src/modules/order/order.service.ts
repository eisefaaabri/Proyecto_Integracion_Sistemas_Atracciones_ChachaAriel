import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { createHash } from "crypto";
import {
  CanalOrden,
  CodigoEstadoOrden,
  EstadoOrden,
  Idempotencia,
  Orden,
  OrdenDetalle,
} from "./order.entities";

export interface LineaOrden {
  atrId: number;
  tipo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export interface NuevaOrden {
  numero: string;
  usuId: number | null;
  canal: CanalOrden;
  referenciaExterna?: string | null;
  correlationId?: string | null;
  contactoCorreo?: string | null;
  contactoTelefono?: string | null;
  estado: CodigoEstadoOrden;
  mpaId?: number | null;
  observaciones?: string | null;
  lineas: LineaOrden[];
}

const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const DIAS_IDEMPOTENCIA = 30;

export function hashSolicitud(cuerpo: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(cuerpo ?? {}))
    .digest("hex");
}

@Injectable()
export class OrderService {
  private estados: Map<CodigoEstadoOrden, number> | null = null;

  constructor(
    @InjectRepository(Orden) private readonly ordenes: Repository<Orden>,
    @InjectRepository(EstadoOrden)
    private readonly estadosRepo: Repository<EstadoOrden>,
  ) {}

  async estadoId(codigo: CodigoEstadoOrden): Promise<number> {
    if (!this.estados) {
      const filas = await this.estadosRepo.find();
      this.estados = new Map(filas.map((e) => [e.est_codigo, e.est_id]));
    }
    return this.estados.get(codigo);
  }

  async crear(
    d: NuevaOrden,
    manager: EntityManager,
  ): Promise<{ orden: Orden; detalles: OrdenDetalle[] }> {
    const total =
      Math.round(d.lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
    const { identifiers } = await manager.insert(Orden, {
      ord_numero: d.numero,
      usu_id: d.usuId,
      ord_canal: d.canal,
      ord_referencia_externa: d.referenciaExterna ?? null,
      ord_correlation_id: d.correlationId ?? null,
      ord_contacto_correo:
        d.contactoCorreo && RE_CORREO.test(d.contactoCorreo)
          ? d.contactoCorreo
          : null,
      ord_contacto_telefono: d.contactoTelefono ?? null,
      est_id: await this.estadoId(d.estado),
      mpa_id: d.mpaId ?? null,
      ord_subtotal: total,
      ord_total: total,
      ord_observaciones: d.observaciones?.slice(0, 500) ?? null,
    });
    const ordId = Number(identifiers[0].ord_id);
    const detalles: OrdenDetalle[] = [];
    for (const l of d.lineas) {
      const ins = await manager.insert(OrdenDetalle, {
        ord_id: ordId,
        atr_id: l.atrId,
        det_tipo_pasajero: l.tipo,
        det_descripcion: l.descripcion.slice(0, 255),
        det_cantidad: l.cantidad,
        det_precio_unitario: l.precio,
        det_subtotal: l.subtotal,
      });
      detalles.push(
        Object.assign(new OrdenDetalle(), {
          det_id: Number(ins.identifiers[0].det_id),
          ord_id: ordId,
          atr_id: l.atrId,
          det_tipo_pasajero: l.tipo,
          det_descripcion: l.descripcion,
          det_cantidad: l.cantidad,
          det_precio_unitario: l.precio,
          det_subtotal: l.subtotal,
        }),
      );
    }
    const orden = await manager.findOneOrFail(Orden, {
      where: { ord_id: ordId },
      relations: { estado: true },
    });
    return { orden, detalles };
  }

  async cambiarEstado(
    ordId: number,
    codigo: CodigoEstadoOrden,
    manager: EntityManager,
    mpaId?: number,
  ): Promise<void> {
    await manager.update(
      Orden,
      { ord_id: ordId },
      {
        est_id: await this.estadoId(codigo),
        ...(mpaId !== undefined && { mpa_id: mpaId }),
      },
    );
  }

  porId(ordId: number, manager?: EntityManager): Promise<Orden | null> {
    return (manager ?? this.ordenes.manager).findOne(Orden, {
      where: { ord_id: ordId },
      relations: { estado: true, detalles: true },
    });
  }

  async porIds(
    ids: number[],
    manager?: EntityManager,
  ): Promise<Map<number, Orden>> {
    if (!ids.length) return new Map();
    const filas = await (manager ?? this.ordenes.manager).find(Orden, {
      where: { ord_id: In([...new Set(ids)]) },
      relations: { estado: true, detalles: true },
    });
    return new Map(filas.map((o) => [o.ord_id, o]));
  }

  delUsuario(usuId: number): Promise<Orden[]> {
    return this.ordenes.find({
      where: { usu_id: usuId },
      relations: { estado: true, detalles: true },
      order: { ord_creado_en: "DESC" },
    });
  }

  porReferenciaExterna(referencia: string): Promise<Orden[]> {
    return this.ordenes.find({
      where: {
        ord_referencia_externa: referencia,
        ord_canal: CanalOrden.BOOKING,
      },
    });
  }

  // --- Idempotencia (evita reservas y cobros dobles ante reintentos) ---

  /**
   * Reserva la clave dentro de la transacción. Si ya existe devuelve el registro previo;
   * si otra transacción la está usando, el INSERT espera a que termine y luego choca (23505).
   */
  async tomarClave(
    clave: string,
    sujeto: string,
    operacion: string,
    hash: string,
    manager: EntityManager,
  ): Promise<Idempotencia | null> {
    const previa = await manager.findOne(Idempotencia, {
      where: { idem_clave: clave, idem_sujeto: sujeto },
    });
    if (previa) return previa;
    await manager.insert(Idempotencia, {
      idem_clave: clave,
      idem_sujeto: sujeto,
      idem_operacion: operacion.slice(0, 150),
      idem_request_hash: hash,
      idem_estado: "IN_PROGRESS",
      idem_expira_en: new Date(Date.now() + DIAS_IDEMPOTENCIA * 86_400_000),
    });
    return null;
  }

  async completarClave(
    clave: string,
    sujeto: string,
    recursoId: string,
    respuesta: unknown,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      Idempotencia,
      { idem_clave: clave, idem_sujeto: sujeto },
      {
        idem_estado: "DONE",
        idem_recurso_id: recursoId,
        idem_response: respuesta as object,
      },
    );
  }

  claveExistente(clave: string, sujeto: string): Promise<Idempotencia | null> {
    return this.ordenes.manager.findOne(Idempotencia, {
      where: { idem_clave: clave, idem_sujeto: sujeto },
    });
  }
}
