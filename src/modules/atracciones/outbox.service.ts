import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, MoreThan, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { Atraccion } from "./entities/atraccion.entity";
import {
  OutboxEvento,
  TipoEventoOutbox,
} from "./entities/outbox-evento.entity";
import { contarBoletosOcupados } from "./aforo.util";
import { HORARIOS_TURNO } from "./reservas.constants";
import { currentCorrelationId } from "../../common/middleware/correlation-id.middleware";

// Clave arbitraria del advisory lock que ordena las inserciones del outbox.
const OUTBOX_LOCK_KEY = 82000003;
const SOURCE = "/api/v3/atracciones";

const ESTADO_POR_EVENTO: Partial<Record<TipoEventoOutbox, string>> = {
  [TipoEventoOutbox.RESERVA_CREADA]: "PENDING",
  [TipoEventoOutbox.RESERVA_CONFIRMADA]: "CONFIRMED",
  [TipoEventoOutbox.RESERVA_CANCELADA]: "CANCELLED",
};

export interface CambioReserva {
  reservaId: string;
  codigo: string | null;
  canal: string;
  atraccionId: string;
  fecha: string;
  hora: string | null;
  boletos: number;
  total: number;
  extra?: Record<string, unknown>;
}

function slotId(fecha: string, hora24: string): string {
  return `slot-${fecha.replace(/-/g, "")}-${hora24.replace(":", "")}`;
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvento)
    private readonly eventos: Repository<OutboxEvento>,
  ) {}

  // Debe llamarse con el manager de la transacción del cambio, al final: el
  // evento se confirma o se revierte con él.
  async registrarCambioReserva(
    manager: EntityManager,
    tipo: TipoEventoOutbox,
    cambio: CambioReserva,
  ): Promise<void> {
    await this.bloquearSecuencia(manager);
    await this.insertar(manager, tipo, cambio.codigo ?? cambio.reservaId, {
      reservation_id: cambio.reservaId,
      reservation_code: cambio.codigo,
      channel: cambio.canal,
      status: ESTADO_POR_EVENTO[tipo],
      attraction_id: cambio.atraccionId,
      date: cambio.fecha,
      time_24h: cambio.hora,
      ticket_count: cambio.boletos,
      total_price: cambio.total,
      currency: "USD",
      ...cambio.extra,
    });

    const atraccion = await manager.findOne(Atraccion, {
      where: { id: cambio.atraccionId },
    });
    if (!atraccion) return;
    const ocupados = await contarBoletosOcupados(
      manager,
      atraccion.id,
      cambio.fecha,
    );
    await this.insertar(
      manager,
      TipoEventoOutbox.STOCK_ACTUALIZADO,
      atraccion.id,
      {
        attraction_id: atraccion.id,
        date: cambio.fecha,
        total_units: atraccion.capacidad_diaria,
        available_units:
          atraccion.estado === "ACTIVA"
            ? Math.max(atraccion.capacidad_diaria - ocupados, 0)
            : 0,
        // El aforo es diario: todos los turnos comparten available_units.
        slot_ids: HORARIOS_TURNO.map((h) => slotId(cambio.fecha, h)),
      },
    );
  }

  async listar(after: number, limit: number, tipo?: TipoEventoOutbox) {
    const eventos = await this.eventos.find({
      where: {
        evt_id: MoreThan(String(after)),
        ...(tipo && { event_type: tipo }),
      },
      order: { evt_id: "ASC" },
      take: limit,
    });
    return eventos.map((e) => ({
      specversion: "1.0",
      source: SOURCE,
      event_id: e.event_id,
      sequence_number: Number(e.evt_id),
      event_type: e.event_type,
      aggregate_id: e.aggregate_id,
      correlation_id: e.correlation_id,
      timestamp: e.created_at.toISOString(),
      payload: e.payload,
      data: e.payload,
    }));
  }

  // Serializa la asignación de evt_id hasta el commit: así el orden de la
  // secuencia coincide con el de confirmación y un lector por cursor no se
  // salta eventos de transacciones que terminaron más tarde.
  private async bloquearSecuencia(manager: EntityManager) {
    await manager.query("SELECT pg_advisory_xact_lock($1)", [OUTBOX_LOCK_KEY]);
  }

  private async insertar(
    manager: EntityManager,
    tipo: TipoEventoOutbox,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    await manager.insert(OutboxEvento, {
      event_type: tipo,
      aggregate_id: aggregateId,
      correlation_id: currentCorrelationId() ?? randomUUID(),
      payload,
    });
  }
}
