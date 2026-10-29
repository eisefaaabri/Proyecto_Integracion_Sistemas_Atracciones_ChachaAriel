import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum TipoEventoOutbox {
  RESERVA_CREADA = "RESERVA_CREADA",
  RESERVA_CONFIRMADA = "RESERVA_CONFIRMADA",
  RESERVA_CANCELADA = "RESERVA_CANCELADA",
  STOCK_ACTUALIZADO = "STOCK_ACTUALIZADO",
}

@Entity("outbox_eventos")
export class OutboxEvento {
  // Secuencia monótona: es el sequence_number y el cursor `after` del feed.
  @PrimaryGeneratedColumn({ type: "bigint" })
  evt_id: string;

  @Index({ unique: true })
  @Column({ type: "uuid", unique: true, default: () => "gen_random_uuid()" })
  event_id: string;

  @Index()
  @Column({ type: "varchar", length: 40 })
  event_type: TipoEventoOutbox;

  @Column({ type: "varchar", length: 100 })
  aggregate_id: string;

  @Column({ type: "varchar", length: 100 })
  correlation_id: string;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz" })
  created_at: Date;
}
