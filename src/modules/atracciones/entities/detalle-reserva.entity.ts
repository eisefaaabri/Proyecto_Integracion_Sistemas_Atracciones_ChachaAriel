import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Min } from 'class-validator';
import { Reserva } from './reserva.entity';
import { Atraccion } from './atraccion.entity';

@Entity('detalles_reserva')
export class DetalleReserva {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Min(1)
  cantidad_boletos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @Min(0)
  precio_unitario_historico: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @ManyToOne(() => Reserva, (reserva) => reserva.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reserva_id' })
  reserva: Reserva;

  @ManyToOne(() => Atraccion, (atraccion) => atraccion.detalles_reserva, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'atraccion_id' })
  atraccion: Atraccion;
}
