import { EntityManager } from "typeorm";
import { DetalleReserva } from "./entities/detalle-reserva.entity";
import { BOOKABLE_STATES } from "./reservas.constants";

// Boletos que ocupan aforo en esa fecha. Dentro de una transacción ve sus propios cambios.
export async function contarBoletosOcupados(
  manager: EntityManager,
  atraccionId: string,
  fecha: string,
): Promise<number> {
  const row = await manager
    .createQueryBuilder(DetalleReserva, "d")
    .innerJoin("d.reserva", "r")
    .select("COALESCE(SUM(d.cantidad_boletos), 0)", "sum")
    .where("d.atraccion_id = :atraccionId", { atraccionId })
    .andWhere("r.fecha_reserva = :fecha", { fecha })
    .andWhere("r.estado_reserva IN (:...estados)", {
      estados: BOOKABLE_STATES,
    })
    .getRawOne();
  return Number(row?.sum ?? 0);
}
