import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

export enum CodigoEstadoReserva {
  PENDIENTE_PAGO = "PENDIENTE_PAGO",
  CONFIRMADA = "CONFIRMADA",
  CHECKED_IN = "CHECKED_IN",
  CANCELADA = "CANCELADA",
  COMPLETADA = "COMPLETADA",
}

// Estados que ocupan cupo en el turno.
export const ESTADOS_ACTIVOS = [
  CodigoEstadoReserva.PENDIENTE_PAGO,
  CodigoEstadoReserva.CONFIRMADA,
  CodigoEstadoReserva.CHECKED_IN,
];

export enum TipoEventoOutbox {
  RESERVA_CREADA = "RESERVA_CREADA",
  RESERVA_CONFIRMADA = "RESERVA_CONFIRMADA",
  RESERVA_CANCELADA = "RESERVA_CANCELADA",
  STOCK_ACTUALIZADO = "STOCK_ACTUALIZADO",
}

@Entity({ schema: "ms_booking", name: "estado" })
export class EstadoReserva {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  est_id: number;

  @Column({ type: "varchar", length: 20 })
  est_codigo: CodigoEstadoReserva;
}

@Entity({ schema: "ms_booking", name: "reserva" })
export class Reserva {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  res_id: number;

  @Column({ type: "uuid", insert: false, update: false })
  res_uuid: string;

  @Column({ type: "varchar", length: 12 })
  res_codigo: string;

  @Column({ type: "bigint", transformer: aNumero })
  ord_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  det_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  dis_id: number;

  @Column({ type: "smallint" })
  est_id: number;

  @Column({ type: "int" })
  res_adultos: number;

  @Column({ type: "int", default: 0 })
  res_ninos: number;

  @Column({ type: "int", default: 0 })
  res_seniors: number;

  @Column({ type: "int", default: 0 })
  res_infantes: number;

  @Column({ type: "int" })
  res_numero_tickets: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  res_precio_unitario: number;

  @Column({ type: "numeric", precision: 12, scale: 2, transformer: aNumero })
  res_subtotal: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  res_observaciones: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  res_motivo_cancelacion: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  res_cancelacion_solicitante: string | null;

  @Column({ type: "timestamptz", nullable: true })
  res_checkin_en: Date | null;

  @Column({ type: "varchar", length: 150, nullable: true })
  res_checkin_guia: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  res_checkin_dispositivo: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  res_checkin_idempotencia: string | null;

  @Column({ type: "timestamptz", insert: false, update: false })
  res_creado_en: Date;

  @Column({ type: "timestamptz", nullable: true })
  res_cancelado_en: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  res_confirmado_en: Date | null;

  @ManyToOne(() => EstadoReserva)
  @JoinColumn({ name: "est_id" })
  estado: EstadoReserva;

  @OneToMany(() => ReservaPasajero, (p) => p.reserva)
  pasajeros: ReservaPasajero[];
}

@Entity({ schema: "ms_booking", name: "reserva_pasajero" })
export class ReservaPasajero {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  pax_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  res_id: number;

  @Column({ type: "varchar", length: 120 })
  pax_nombre: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  pax_documento: string | null;

  @Column({ type: "boolean", default: false })
  pax_es_titular: boolean;

  @ManyToOne(() => Reserva, (r) => r.pasajeros, { onDelete: "CASCADE" })
  @JoinColumn({ name: "res_id" })
  reserva: Reserva;
}

@Entity({ schema: "ms_booking", name: "outbox_evento" })
export class OutboxEvento {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  evt_id: number;

  @Column({ type: "uuid", insert: false, update: false })
  evt_uuid: string;

  @Column({ type: "varchar", length: 40 })
  evt_tipo: TipoEventoOutbox;

  @Column({ type: "varchar", length: 100 })
  evt_agregado_id: string;

  @Column({ type: "varchar", length: 100 })
  evt_correlation_id: string;

  @Column({ type: "jsonb" })
  evt_payload: Record<string, unknown>;

  @Column({ type: "timestamptz", insert: false, update: false })
  evt_creado_en: Date;
}
