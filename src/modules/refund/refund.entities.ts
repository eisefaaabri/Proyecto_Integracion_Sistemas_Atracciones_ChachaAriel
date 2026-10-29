import { Column, Entity } from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

@Entity({ schema: "ms_refund", name: "reembolso" })
export class Reembolso {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  rem_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  pag_id: number;

  @Column({ type: "varchar", length: 30 })
  rem_numero: string;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  rem_monto: number;

  @Column({ type: "varchar", length: 300, nullable: true })
  rem_motivo: string | null;

  @Column({ type: "timestamptz", nullable: true })
  rem_procesado_en: Date | null;
}
