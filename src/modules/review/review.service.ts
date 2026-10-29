import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Resena } from "./review.entities";

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Resena) private readonly resenas: Repository<Resena>,
  ) {}

  // Una reseña por usuario y atracción: volver a reseñar la reemplaza.
  async publicar(
    atrId: number,
    usuId: number,
    puntuacion: number,
    comentario: string,
    manager: EntityManager,
  ): Promise<Resena> {
    const [fila] = await manager.query(
      `INSERT INTO ms_review.resena (atr_id, usu_id, ren_puntuacion, ren_comentario, ren_creado_en)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (atr_id, usu_id) DO UPDATE SET ren_puntuacion = EXCLUDED.ren_puntuacion,
         ren_comentario = EXCLUDED.ren_comentario, ren_creado_en = now(), ren_visible = TRUE
       RETURNING ren_id`,
      [atrId, usuId, puntuacion, comentario.slice(0, 1000)],
    );
    return manager.findOneOrFail(Resena, {
      where: { ren_id: Number(fila.ren_id) },
    });
  }

  async estadisticas(
    atrId: number,
    manager: EntityManager,
  ): Promise<{ promedio: number; total: number }> {
    const [fila] = await manager.query(
      `SELECT COALESCE(round(avg(ren_puntuacion), 2), 0) AS promedio, count(*)::int AS total
       FROM ms_review.resena WHERE atr_id = $1 AND ren_visible`,
      [atrId],
    );
    return { promedio: Number(fila.promedio), total: Number(fila.total) };
  }

  visibles(atrId: number): Promise<Resena[]> {
    return this.resenas.find({
      where: { atr_id: atrId, ren_visible: true },
      order: { ren_creado_en: "DESC" },
    });
  }
}
