import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

export enum CodigoEstadoOrden {
  CREADA = "CREADA",
  PAGADA = "PAGADA",
  CANCELADA = "CANCELADA",
  REEMBOLSADA = "REEMBOLSADA",
}

export enum CanalOrden {
  WEB = "WEB",
  BOOKING = "BOOKING",
}

@Entity({ schema: "ms_order", name: "estado" })
export class EstadoOrden {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  est_id: number;

  @Column({ type: "varchar", length: 20 })
  est_codigo: CodigoEstadoOrden;
}

@Entity({ schema: "ms_order", name: "orden" })
export class Orden {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  ord_id: number;

  @Column({ type: "varchar", length: 20 })
  ord_numero: string;

  @Column({ type: "bigint", nullable: true, transformer: aNumero })
  usu_id: number | null;

  @Column({ type: "varchar", length: 10 })
  ord_canal: CanalOrden;

  @Column({ type: "varchar", length: 100, nullable: true })
  ord_referencia_externa: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  ord_correlation_id: string | null;

  @Column({ type: "varchar", length: 160, nullable: true })
  ord_contacto_correo: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  ord_contacto_telefono: string | null;

  @Column({ type: "smallint" })
  est_id: number;

  @Column({ type: "smallint", nullable: true })
  mpa_id: number | null;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  ord_subtotal: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  ord_total: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  ord_observaciones: string | null;

  @Column({ type: "timestamptz", insert: false, update: false })
  ord_creado_en: Date;

  @ManyToOne(() => EstadoOrden)
  @JoinColumn({ name: "est_id" })
  estado: EstadoOrden;

  @OneToMany(() => OrdenDetalle, (d) => d.orden)
  detalles: OrdenDetalle[];
}

@Entity({ schema: "ms_order", name: "orden_detalle" })
export class OrdenDetalle {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  det_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  ord_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "varchar", length: 10 })
  det_tipo_pasajero: string;

  @Column({ type: "varchar", length: 255 })
  det_descripcion: string;

  @Column({ type: "int" })
  det_cantidad: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  det_precio_unitario: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  det_subtotal: number;

  @ManyToOne(() => Orden, (o) => o.detalles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ord_id" })
  orden: Orden;
}

@Entity({ schema: "ms_order", name: "idempotencia" })
export class Idempotencia {
  @PrimaryColumn({ type: "varchar", length: 100 })
  idem_clave: string;

  @PrimaryColumn({ type: "varchar", length: 64 })
  idem_sujeto: string;

  @Column({ type: "varchar", length: 150 })
  idem_operacion: string;

  @Column({ type: "varchar", length: 64 })
  idem_request_hash: string;

  @Column({ type: "varchar", length: 12 })
  idem_estado: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  idem_recurso_id: string | null;

  @Column({ type: "jsonb", nullable: true })
  idem_response: unknown;

  @Column({ type: "timestamptz" })
  idem_expira_en: Date;
}
