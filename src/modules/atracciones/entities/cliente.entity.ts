import { Entity, PrimaryGeneratedColumn, Column, OneToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { Usuario } from '../../auth/entities/usuario.entity';
import { Reserva } from './reserva.entity';
import { Factura } from './factura.entity';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  dni: string;

  @Column({ type: 'varchar', length: 150 })
  nombre_completo: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono: string;

  @OneToOne(() => Usuario, (usuario) => usuario.cliente, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @OneToMany(() => Reserva, (reserva) => reserva.cliente)
  reservas: Reserva[];

  @OneToMany(() => Factura, (factura) => factura.cliente)
  facturas: Factura[];
}
