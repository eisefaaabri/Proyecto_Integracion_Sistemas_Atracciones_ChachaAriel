import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn } from 'typeorm';
import { Cliente } from './cliente.entity';
import { DetalleReserva } from './detalle-reserva.entity';
import { Factura } from './factura.entity';

export enum EstadoReserva { PENDIENTE = 'PENDIENTE', CONFIRMADA = 'CONFIRMADA', CANCELADA = 'CANCELADA' }

@Entity('reservas')
export class Reserva {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  fecha_reserva: string;

  @Column({ type: 'enum', enum: EstadoReserva, default: EstadoReserva.PENDIENTE })
  estado_reserva: EstadoReserva;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Cliente, (cliente) => cliente.reservas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @OneToMany(() => DetalleReserva, (detalle) => detalle.reserva, { cascade: true })
  detalles: DetalleReserva[];

  @OneToOne(() => Factura, (factura) => factura.reserva)
  factura: Factura;
}
