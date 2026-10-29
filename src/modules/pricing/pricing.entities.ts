import {
  Column,
  Entity,
  OneToMany,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

export enum TipoTarifa {
  ADULTO = "ADULTO",
  NINO = "NINO",
  MAYOR = "MAYOR",
  INFANTE = "INFANTE",
}

@Entity({ schema: "ms_pricing", name: "tarifa" })
export class Tarifa {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  tar_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "varchar", length: 20 })
  tar_tipo: TipoTarifa;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  tar_precio: number;

  @Column({ type: "char", length: 3, default: "USD" })
  tar_moneda: string;

  @Column({ type: "date" })
  tar_vigente_desde: string;

  @Column({ type: "date", nullable: true })
  tar_vigente_hasta: string | null;
}

// Acuerdo B2B con Booking (fila única, cpr_id = 1).
@Entity({ schema: "ms_pricing", name: "contrato_promocion" })
export class ContratoPromocion {
  @PrimaryColumn({ type: "smallint", default: 1 })
  cpr_id: number;

  @Column({ type: "boolean" })
  cpr_permite_promociones: boolean;

  @Column({ type: "numeric", precision: 5, scale: 2, transformer: aNumero })
  cpr_porcentaje_maximo: number;

  @Column({ type: "date", nullable: true })
  cpr_fecha_acuerdo: string | null;

  @Column({ type: "date", nullable: true })
  cpr_vigencia_hasta: string | null;

  @Column({ type: "varchar", length: 1000, nullable: true })
  cpr_condiciones: string | null;

  @Column({ type: "varchar", length: 150, nullable: true })
  cpr_contacto_nombre: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  cpr_contacto_correo: string | null;

  @Column({ type: "timestamptz" })
  cpr_actualizado_en: Date;

  @OneToMany(() => ContratoPromocionDestino, (d) => d.contrato, {
    cascade: true,
  })
  destinos: ContratoPromocionDestino[];
}

@Entity({ schema: "ms_pricing", name: "contrato_promocion_destino" })
export class ContratoPromocionDestino {
  @PrimaryGeneratedColumn("identity", {
    type: "int",
    generatedIdentity: "ALWAYS",
  })
  cpd_id: number;

  @Column({ type: "smallint" })
  cpr_id: number;

  @Column({ type: "varchar", length: 100 })
  cpd_nombre: string;

  @Column({ type: "smallint", default: 0 })
  cpd_orden: number;

  @ManyToOne(() => ContratoPromocion, (c) => c.destinos, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "cpr_id" })
  contrato: ContratoPromocion;
}
