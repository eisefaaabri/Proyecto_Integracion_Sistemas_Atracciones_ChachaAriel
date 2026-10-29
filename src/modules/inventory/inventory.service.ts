import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { Disponibilidad, FechaBloqueada, Horario } from "./inventory.entities";

export const HORARIOS_POR_DEFECTO = ["09:00", "14:00"];

export interface CupoTurno {
  horId: number;
  hora: string; // HH:mm
  total: number;
  reservado: number;
  cerrada: boolean;
}

export interface UbicacionTurno {
  disId: number;
  atrId: number;
  fecha: string;
  hora: string; // HH:mm
}

const hhmm = (t: string) => t.slice(0, 5);
const fechaIso = (d: string | Date) =>
  (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Horario) private readonly horarios: Repository<Horario>,
    @InjectRepository(Disponibilidad)
    private readonly disponibilidades: Repository<Disponibilidad>,
  ) {}

  async crearHorarios(
    atrId: number,
    cupo: number,
    manager: EntityManager,
  ): Promise<void> {
    for (const hora of HORARIOS_POR_DEFECTO) {
      await manager.insert(Horario, {
        atr_id: atrId,
        hor_hora: hora,
        hor_cupo: cupo,
        hor_activo: true,
      });
    }
  }

  // Cambia el cupo de los turnos y de las fechas futuras (sin bajar de lo ya reservado).
  async actualizarCupo(
    atrId: number,
    cupo: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(Horario, { atr_id: atrId }, { hor_cupo: cupo });
    await manager.query(
      `UPDATE ms_inventory.disponibilidad SET dis_cupo_total = GREATEST($2::int, dis_cupo_reservado)
       WHERE atr_id = $1 AND dis_fecha >= CURRENT_DATE`,
      [atrId, cupo],
    );
  }

  async horariosActivos(
    atrIds: number[],
    manager?: EntityManager,
  ): Promise<Map<number, Horario[]>> {
    const mapa = new Map<number, Horario[]>();
    if (!atrIds.length) return mapa;
    const filas = await (manager ?? this.horarios.manager).find(Horario, {
      where: { atr_id: In([...new Set(atrIds)]), hor_activo: true },
      order: { hor_hora: "ASC" },
    });
    for (const h of filas)
      mapa.set(h.atr_id, [...(mapa.get(h.atr_id) ?? []), h]);
    return mapa;
  }

  // Cupo por turno activo de una fecha. Si la fecha está bloqueada, todos quedan cerrados.
  async cuposDelDia(
    atrId: number,
    fecha: string,
    manager?: EntityManager,
  ): Promise<CupoTurno[]> {
    const m = manager ?? this.horarios.manager;
    const [horarios, filas, bloqueo] = await Promise.all([
      m.find(Horario, {
        where: { atr_id: atrId, hor_activo: true },
        order: { hor_hora: "ASC" },
      }),
      m.find(Disponibilidad, { where: { atr_id: atrId, dis_fecha: fecha } }),
      m.findOne(FechaBloqueada, { where: { atr_id: atrId, fb_fecha: fecha } }),
    ]);
    const porHorario = new Map(filas.map((d) => [d.hor_id, d]));
    return horarios.map((h) => {
      const d = porHorario.get(h.hor_id);
      return {
        horId: h.hor_id,
        hora: hhmm(h.hor_hora),
        total: d?.dis_cupo_total ?? h.hor_cupo,
        reservado: d?.dis_cupo_reservado ?? 0,
        cerrada: Boolean(bloqueo) || Boolean(d?.dis_cerrada),
      };
    });
  }

  /**
   * Descuenta n cupos del turno en una sola sentencia condicional: si no alcanzan, no
   * actualiza ninguna fila y devuelve null. Concurrencia segura sin SUM ni sobreventa.
   */
  async reservar(
    atrId: number,
    horId: number,
    fecha: string,
    n: number,
    manager: EntityManager,
  ): Promise<number | null> {
    await manager.query(
      `INSERT INTO ms_inventory.disponibilidad (atr_id, hor_id, dis_fecha, dis_cupo_total)
       SELECT h.atr_id, h.hor_id, $3::date, h.hor_cupo FROM ms_inventory.horario h
       WHERE h.hor_id = $2 AND h.atr_id = $1
       ON CONFLICT (atr_id, dis_fecha, hor_id) DO NOTHING`,
      [atrId, horId, fecha],
    );
    const filas = await manager.query(
      `UPDATE ms_inventory.disponibilidad d SET dis_cupo_reservado = d.dis_cupo_reservado + $4
       WHERE d.atr_id = $1 AND d.hor_id = $2 AND d.dis_fecha = $3::date AND NOT d.dis_cerrada
         AND d.dis_cupo_reservado + $4 <= d.dis_cupo_total
         AND NOT EXISTS (SELECT 1 FROM ms_inventory.fecha_bloqueada b WHERE b.atr_id = $1 AND b.fb_fecha = $3::date)
       RETURNING d.dis_id`,
      [atrId, horId, fecha, n],
    );
    // pg devuelve [filas, conteo] para UPDATE ... RETURNING vía query().
    const rows = Array.isArray(filas[0]) ? filas[0] : filas;
    return rows.length ? Number(rows[0].dis_id) : null;
  }

  async liberar(
    disId: number,
    n: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE ms_inventory.disponibilidad SET dis_cupo_reservado = GREATEST(dis_cupo_reservado - $2, 0)
       WHERE dis_id = $1`,
      [disId, n],
    );
  }

  async ubicaciones(
    disIds: number[],
    manager?: EntityManager,
  ): Promise<Map<number, UbicacionTurno>> {
    const mapa = new Map<number, UbicacionTurno>();
    if (!disIds.length) return mapa;
    const filas = await (manager ?? this.disponibilidades.manager).query(
      `SELECT d.dis_id, d.atr_id, d.dis_fecha::text AS fecha, h.hor_hora::text AS hora
       FROM ms_inventory.disponibilidad d JOIN ms_inventory.horario h ON h.hor_id = d.hor_id
       WHERE d.dis_id = ANY($1)`,
      [[...new Set(disIds)]],
    );
    for (const f of filas) {
      mapa.set(Number(f.dis_id), {
        disId: Number(f.dis_id),
        atrId: Number(f.atr_id),
        fecha: fechaIso(f.fecha),
        hora: hhmm(f.hora),
      });
    }
    return mapa;
  }
}
