import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Min } from 'class-validator';
import { Reserva } from './reserva.entity';
import { Cliente } from './cliente.entity';

export enum EstadoPago { PENDIENTE = 'PENDIENTE', PAGADO = 'PAGADO' }

@Entity('facturas')
export class Factura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  numero_factura: string;

  @Column({ type: 'date' })
  fecha_emision: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  ruc_cliente: string;

  @Column({ type: 'enum', enum: EstadoPago, default: EstadoPago.PENDIENTE })
  estado_pago: EstadoPago;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @Min(0)
  total_pagado: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transaction_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  metodo_pago: string; // Ej: CREDIT_CARD, PAYPAL

  @Column({ type: 'text', nullable: true })
  receipt_url: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToOne(() => Reserva, (reserva) => reserva.factura, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reserva_id' })
  reserva: Reserva;

  @ManyToOne(() => Cliente, (cliente) => cliente.facturas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;
}
