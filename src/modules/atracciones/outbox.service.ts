import { Injectable } from "@nestjs/common";
import { BookingService } from "../booking/booking.service";
import { TipoEventoOutbox } from "../booking/booking.entities";

const SOURCE = "/api/v3/atracciones";

// Feed CloudEvents 1.0 sobre ms_booking.outbox_evento (los eventos se escriben en
// ReservasAppService, dentro de la transacción de cada cambio).
@Injectable()
export class OutboxService {
  constructor(private readonly bookings: BookingService) {}

  async listar(after: number, limit: number, tipo?: TipoEventoOutbox) {
    const eventos = await this.bookings.listarEventos(after, limit, tipo);
    return eventos.map((e) => ({
      specversion: "1.0",
      source: SOURCE,
      event_id: e.evt_uuid,
      sequence_number: e.evt_id,
      event_type: e.evt_tipo,
      aggregate_id: e.evt_agregado_id,
      correlation_id: e.evt_correlation_id,
      timestamp: e.evt_creado_en.toISOString(),
      payload: e.evt_payload,
      data: e.evt_payload,
    }));
  }
}
