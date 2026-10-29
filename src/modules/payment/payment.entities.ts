import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

export enum CodigoEstadoPago {
  PENDIENTE = "PENDIENTE",
  APROBADO = "APROBADO",
  RECHAZADO = "RECHAZADO",
  FALLIDO = "FALLIDO",
}

export enum CodigoMetodoPago {
  TARJETA = "TARJETA",
  TRANSFERENCIA = "TRANSFERENCIA",
  EN_SITIO = "EN_SITIO",
  PAYPAL = "PAYPAL",
  BOOKING = "BOOKING",
}

@Entity({ schema: "ms_payment", name: "estado" })
export class EstadoPago {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  est_id: number;

  @Column({ type: "varchar", length: 20 })
  est_codigo: CodigoEstadoPago;
}

@Entity({ schema: "ms_payment", name: "metodo_pago" })
export class MetodoPago {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  mpa_id: number;

  @Column({ type: "varchar", length: 20 })
  mpa_codigo: CodigoMetodoPago;
}

@Entity({ schema: "ms_payment", name: "pago" })
export class Pago {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  pag_id: number;

  @Column({ type: "varchar", length: 30 })
  pag_numero: string;

  @Column({ type: "bigint", transformer: aNumero })
  ord_id: number;

  @Column({ type: "smallint" })
  mpa_id: number;

  @Column({ type: "smallint" })
  est_id: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  pag_monto: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  pag_referencia: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  pag_comprobante_url: string | null;

  @Column({ type: "timestamptz", nullable: true })
  pag_aprobado_en: Date | null;
}
