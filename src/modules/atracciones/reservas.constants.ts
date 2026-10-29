import { EstadoReserva } from "./entities/reserva.entity";

export const BOOKABLE_STATES: EstadoReserva[] = [
  EstadoReserva.PENDIENTE,
  EstadoReserva.CONFIRMADA,
];

// Turnos de inicio (HH:mm). El aforo es diario y lo comparten todos los turnos.
export const HORARIOS_TURNO = ["09:00", "14:00"];
