import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Atraccion } from './atraccion.entity';

export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
}

@Entity('reservations')
@Check('CHK_ticket_count', '"ticket_count" >= 1')
@Check('CHK_total_price', '"total_price_total" >= 0')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  reservation_id: string;

  @ManyToOne(() => Atraccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atraccion_id' })
  atraccion: Atraccion;

  @Column({ type: 'varchar', length: 50 })
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

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  total_price_currency: string;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  total_price_total: number;

  @Column({ type: 'uuid', unique: true })
  idempotency_key: string;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
