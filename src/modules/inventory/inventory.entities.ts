import { Column, Entity } from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

@Entity({ schema: "ms_inventory", name: "horario" })
export class Horario {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  hor_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  // "HH:mm:ss"
  @Column({ type: "time" })
  hor_hora: string;

  @Column({ type: "int" })
  hor_cupo: number;

  @Column({ type: "boolean", default: true })
  hor_activo: boolean;
}

@Entity({ schema: "ms_inventory", name: "disponibilidad" })
export class Disponibilidad {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  dis_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  hor_id: number;

  @Column({ type: "date" })
  dis_fecha: string;

  @Column({ type: "int" })
  dis_cupo_total: number;

  @Column({ type: "int" })
  dis_cupo_reservado: number;

  @Column({ type: "boolean" })
  dis_cerrada: boolean;
}

@Entity({ schema: "ms_inventory", name: "fecha_bloqueada" })
export class FechaBloqueada {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  fb_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "date" })
  fb_fecha: string;

  @Column({ type: "varchar", length: 200 })
  fb_motivo: string;
}
