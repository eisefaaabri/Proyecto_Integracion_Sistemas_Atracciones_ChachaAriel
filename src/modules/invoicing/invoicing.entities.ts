import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

export enum CodigoEstadoFactura {
  NO_PAGADA = "NO_PAGADA",
  PAGADA = "PAGADA",
  ANULADA = "ANULADA",
}

@Entity({ schema: "ms_invoicing", name: "estado" })
export class EstadoFactura {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  est_id: number;

  @Column({ type: "varchar", length: 20 })
  est_codigo: CodigoEstadoFactura;
}

@Entity({ schema: "ms_invoicing", name: "factura" })
export class Factura {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  fac_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  ord_id: number;

  @Column({ type: "bigint", nullable: true, transformer: aNumero })
  dfa_id: number | null;

  @Column({ type: "varchar", length: 20 })
  fac_numero: string;

  @Column({ type: "smallint" })
  est_id: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  fac_subtotal: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  fac_total: number;

  @Column({ type: "varchar", length: 20 })
  fac_tipo_identificacion: string;

  @Column({ type: "varchar", length: 20 })
  fac_identificacion: string;

  @Column({ type: "varchar", length: 150 })
  fac_razon_social: string;

  @Column({ type: "varchar", length: 160 })
  fac_correo: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  fac_telefono: string | null;

  @OneToMany(() => FacturaDetalle, (d) => d.factura, { cascade: ["insert"] })
  detalles: FacturaDetalle[];
}

@Entity({ schema: "ms_invoicing", name: "factura_detalle" })
export class FacturaDetalle {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  fde_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  fac_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  det_id: number;

  @Column({ type: "varchar", length: 25 })
  fde_codigo: string;

  @Column({ type: "varchar", length: 300 })
  fde_descripcion: string;

  @Column({ type: "int" })
  fde_cantidad: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  fde_precio_unitario: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  fde_subtotal: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  fde_total: number;

  @ManyToOne(() => Factura, (f) => f.detalles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "fac_id" })
  factura: Factura;
}
