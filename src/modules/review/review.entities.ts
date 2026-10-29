import { Column, Entity } from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

@Entity({ schema: "ms_review", name: "resena" })
export class Resena {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  ren_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "bigint", nullable: true, transformer: aNumero })
  usu_id: number | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  ren_autor_nombre: string | null;

  @Column({ type: "smallint" })
  ren_puntuacion: number;

  @Column({ type: "varchar", length: 1000 })
  ren_comentario: string;

  @Column({ type: "boolean", default: true })
  ren_visible: boolean;

  @Column({ type: "timestamptz" })
  ren_creado_en: Date;
}
