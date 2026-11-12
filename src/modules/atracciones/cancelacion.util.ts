import type { VistaReserva } from "./reservas-app.service";

// Regla oficial con Booking (RDA2): cancelar antes del check-in reembolsa el 100 %
// (simulado). Por inasistencia parcial no hay devolución.

/** REF-ATR-XXXXXX a partir del código ECT-XXXXXX de la reserva. */
export function codigoReembolso(resCodigo: string): string {
  return `REF-ATR-${resCodigo.replace(/^ECT-/, "")}`;
}

export type EstadoTurno = "DISPONIBLE" | "ULTIMOS_CUPOS" | "AGOTADO";

export function estadoTurno(libres: number, total: number): EstadoTurno {
  if (libres <= 0) return "AGOTADO";
  return libres <= Math.max(1, Math.ceil(total * 0.2))
    ? "ULTIMOS_CUPOS"
    : "DISPONIBLE";
}

/** Reembolso de una reserva cancelada (o null si no está cancelada). */
export function detalleReembolso(v: VistaReserva) {
  const r = v.reembolso;
  const monto = Number(r?.rem_monto ?? 0);
  return {
    cancel_code: r?.rem_numero ?? codigoReembolso(v.reserva.res_codigo),
    reembolso_id: r?.rem_numero ?? null,
    monto_reembolsado: monto,
    refund: r
      ? {
          refund_id: r.rem_numero,
          status: "PROCESSED",
          amount: monto,
          currency: "USD",
          message: "Reembolso simulado del 100% procesado.",
        }
      : {
          refund_id: null,
          status: "NOT_REQUIRED",
          amount: 0,
          currency: "USD",
          message: "La reserva no estaba pagada: no hay monto que reembolsar.",
        },
  };
}

/** Resultado de devolver los cupos al turno al cancelar. */
export function restitucionStock(
  restituidos: number | null,
  turno: { libres: number; total: number } | null,
) {
  return {
    status: restituidos === null ? "ALREADY_RESTORED" : "RESTORED",
    restored_spots: restituidos ?? 0,
    ...(turno && {
      available_spots: turno.libres,
      slot_status: estadoTurno(turno.libres, turno.total),
    }),
    message:
      restituidos === null
        ? "La reserva ya estaba cancelada: los cupos se restituyeron antes."
        : "Cupos reincorporados a la disponibilidad del operador local.",
  };
}
