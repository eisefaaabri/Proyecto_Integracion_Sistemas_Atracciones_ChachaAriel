import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { randomInt } from "crypto";
import {
  CodigoEstadoReserva,
  EstadoReserva,
  OutboxEvento,
  Reserva,
  ReservaPasajero,
  TipoEventoOutbox,
} from "./booking.entities";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RE_DOCUMENTO = /^[A-Z0-9]{5,20}$/;
// Clave arbitraria del advisory lock que ordena las inserciones del outbox.
const OUTBOX_LOCK_KEY = 82000003;

export interface NuevaReserva {
  codigo: string;
  ordId: number;
  detId: number;
  disId: number;
  estado: CodigoEstadoReserva;
  adultos: number;
  ninos: number;
  seniors: number;
  infantes: number;
  precioUnitario: number;
  subtotal: number;
  observaciones?: string | null;
  titular: { nombre: string; documento?: string | null };
}

export function generarCodigoReserva(): string {
  let code = "ECT-";
  for (let i = 0; i < 6; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

@Injectable()
export class BookingService {
  private estados: Map<CodigoEstadoReserva, number> | null = null;
  private codigos: Map<number, CodigoEstadoReserva> | null = null;

  constructor(
    @InjectRepository(Reserva) private readonly reservas: Repository<Reserva>,
    @InjectRepository(EstadoReserva)
    private readonly estadosRepo: Repository<EstadoReserva>,
    @InjectRepository(OutboxEvento)
    private readonly eventos: Repository<OutboxEvento>,
  ) {}

  private async cargarEstados() {
    if (!this.estados) {
      const filas = await this.estadosRepo.find();
      this.estados = new Map(filas.map((e) => [e.est_codigo, e.est_id]));
      this.codigos = new Map(filas.map((e) => [e.est_id, e.est_codigo]));
    }
  }

  async estadoId(codigo: CodigoEstadoReserva): Promise<number> {
    await this.cargarEstados();
    return this.estados.get(codigo);
  }

  async codigoEstado(estId: number): Promise<CodigoEstadoReserva> {
    await this.cargarEstados();
    return this.codigos.get(estId);
  }

  async crear(d: NuevaReserva, manager: EntityManager): Promise<Reserva> {
    const tickets = d.adultos + d.ninos + d.seniors + d.infantes;
    const { identifiers } = await manager.insert(Reserva, {
      res_codigo: d.codigo,
      ord_id: d.ordId,
      det_id: d.detId,
      dis_id: d.disId,
      est_id: await this.estadoId(d.estado),
      res_adultos: d.adultos,
      res_ninos: d.ninos,
      res_seniors: d.seniors,
      res_infantes: d.infantes,
      res_numero_tickets: tickets,
      res_precio_unitario: d.precioUnitario,
      res_subtotal: d.subtotal,
      res_observaciones: d.observaciones?.slice(0, 500) ?? null,
      res_confirmado_en:
        d.estado === CodigoEstadoReserva.CONFIRMADA ? new Date() : null,
    });
    const resId = Number(identifiers[0].res_id);
    const doc = d.titular.documento?.toUpperCase();
    await manager.insert(ReservaPasajero, {
      res_id: resId,
      pax_nombre: d.titular.nombre.slice(0, 120),
      pax_documento: doc && RE_DOCUMENTO.test(doc) ? doc : null,
      pax_es_titular: true,
    });
    return this.porId(resId, manager);
  }

  porId(resId: number, manager?: EntityManager): Promise<Reserva | null> {
    return (manager ?? this.reservas.manager).findOne(Reserva, {
      where: { res_id: resId },
      relations: { estado: true, pasajeros: true },
    });
  }

  porUuid(uuid: string, manager?: EntityManager): Promise<Reserva | null> {
    return (manager ?? this.reservas.manager).findOne(Reserva, {
      where: { res_uuid: uuid },
      relations: { estado: true, pasajeros: true },
    });
  }

  porCodigo(codigo: string, manager?: EntityManager): Promise<Reserva | null> {
    return (manager ?? this.reservas.manager).findOne(Reserva, {
      where: { res_codigo: codigo },
      relations: { estado: true, pasajeros: true },
    });
  }

  porOrdenes(ordIds: number[], manager?: EntityManager): Promise<Reserva[]> {
    if (!ordIds.length) return Promise.resolve([]);
    return (manager ?? this.reservas.manager).find(Reserva, {
      where: { ord_id: In([...new Set(ordIds)]) },
      relations: { estado: true, pasajeros: true },
      order: { res_creado_en: "DESC" },
    });
  }

  // FOR UPDATE no admite LEFT JOIN en PostgreSQL: se bloquea la fila sola y luego se recarga.
  async bloquear(
    resId: number,
    manager: EntityManager,
  ): Promise<Reserva | null> {
    const fila = await manager.findOne(Reserva, {
      where: { res_id: resId },
      lock: { mode: "pessimistic_write" },
    });
    return fila ? this.porId(resId, manager) : null;
  }

  async actualizar(
    resId: number,
    cambios: Partial<Reserva>,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(Reserva, { res_id: resId }, cambios);
  }

  titular(r: Reserva): ReservaPasajero | undefined {
    return r.pasajeros?.find((p) => p.pax_es_titular) ?? r.pasajeros?.[0];
  }

  // --- Outbox ---

  // Serializa la asignación de evt_id hasta el commit: el orden de la secuencia coincide
  // con el de confirmación y quien lee por cursor no se salta eventos.
  async registrarEventos(
    eventos: {
      tipo: TipoEventoOutbox;
      agregado: string;
      correlationId: string;
      payload: Record<string, unknown>;
    }[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.query("SELECT pg_advisory_xact_lock($1)", [OUTBOX_LOCK_KEY]);
    for (const e of eventos) {
      await manager.insert(OutboxEvento, {
        evt_tipo: e.tipo,
        evt_agregado_id: e.agregado.slice(0, 100),
        evt_correlation_id: e.correlationId.slice(0, 100),
        evt_payload: e.payload,
      });
    }
  }

  listarEventos(
    after: number,
    limit: number,
    tipo?: TipoEventoOutbox,
  ): Promise<OutboxEvento[]> {
    const qb = this.eventos
      .createQueryBuilder("e")
      .where("e.evt_id > :after", { after })
      .orderBy("e.evt_id", "ASC")
      .take(limit);
    if (tipo) qb.andWhere("e.evt_tipo = :tipo", { tipo });
    return qb.getMany();
  }
}
