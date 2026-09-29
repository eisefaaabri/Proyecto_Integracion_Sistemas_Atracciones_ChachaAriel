import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atraccion } from './atraccion.entity';

export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
}

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  reservation_id: string;

  @ManyToOne(() => Atraccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atraccion_id' })
  atraccion: Atraccion;

  @Column({ type: 'uuid' })
  atraccion_id: string;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  time: string;

  @Column({ type: 'int' })
  ticket_count: number;

  @Column({ type: 'varchar', length: 255 })
  customer_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customer_email: string;

  @Column({ type: 'jsonb', nullable: true })
  total_price: { currency: string; total: number };

  @Column({ type: 'uuid' })
  idempotency_key: string;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
