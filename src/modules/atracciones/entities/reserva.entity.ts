import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Cliente } from "./cliente.entity";
import { DetalleReserva } from "./detalle-reserva.entity";
import { Factura } from "./factura.entity";

export enum EstadoReserva {
  PENDIENTE = "PENDIENTE",
  CONFIRMADA = "CONFIRMADA",
  CANCELADA = "CANCELADA",
}

export enum CanalReserva {
  WEB = "WEB",
  BOOKING = "BOOKING",
}

export interface Pasajeros {
  adultos: number;
  ninos: number;
  seniors: number;
  infantes: number;
}

@Entity("reservas")
export class Reserva {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "date" })
  fecha_reserva: string;

  @Column({
    type: "enum",
    enum: EstadoReserva,
    default: EstadoReserva.PENDIENTE,
  })
  estado_reserva: EstadoReserva;

  @Index({ unique: true })
  @Column({ type: "uuid", unique: true, nullable: true })
  idempotency_key: string;

  @Column({ type: "varchar", length: 20, default: CanalReserva.WEB })
  canal: CanalReserva;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 20, unique: true, nullable: true })
  codigo_reserva: string;

  // HH:mm (24 h)
  @Column({ type: "varchar", length: 5, nullable: true })
  hora_turno: string;

  @Column({ type: "varchar", length: 40, nullable: true })
  slot_id: string;

  @Index()
  @Column({ type: "varchar", length: 100, nullable: true })
  booking_reservation_id: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  correlation_id: string;

  @Column({ type: "varchar", length: 150, nullable: true })
  contacto_email: string;

  @Column({ type: "text", nullable: true })
  solicitudes_especiales: string;

  @Column({ type: "jsonb", nullable: true })
  pasajeros: Pasajeros;

  @Column({ type: "timestamptz", nullable: true })
  cancelada_at: Date;

  @Column({ type: "varchar", length: 200, nullable: true })
  cancelacion_motivo: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  cancelacion_solicitante: string;

  // Con checkin_at la reserva sigue CONFIRMADA (ocupa cupo) pero se expone como CHECKED_IN.
  @Column({ type: "timestamptz", nullable: true })
  checkin_at: Date;

  @Column({ type: "varchar", length: 150, nullable: true })
  checkin_guia: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  checkin_dispositivo: string;

  @Column({ type: "uuid", nullable: true })
  checkin_idempotency_key: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Cliente, (cliente) => cliente.reservas, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "cliente_id" })
  cliente: Cliente;

  @OneToMany(() => DetalleReserva, (detalle) => detalle.reserva, {
    cascade: true,
  })
  detalles: DetalleReserva[];

  @OneToOne(() => Factura, (factura) => factura.reserva)
  factura: Factura;
}
