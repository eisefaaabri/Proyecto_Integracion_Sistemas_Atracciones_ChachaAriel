import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, Index } from 'typeorm';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { Cliente } from '../../atracciones/entities/cliente.entity';

export enum RolUsuario { ADMIN = 'ADMIN', TURISTA = 'TURISTA' }

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  @IsEmail()
  email: string;

  @Column({ type: 'varchar', length: 255 })
  @IsNotEmpty()
  password_hash: string;

  @Column({ type: 'enum', enum: RolUsuario, default: RolUsuario.TURISTA })
  rol: RolUsuario;

  @Column({ type: 'boolean', default: true })
  estado: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Cliente, (cliente) => cliente.usuario, { cascade: true })
  cliente: Cliente;
}
