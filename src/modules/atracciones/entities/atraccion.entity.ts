import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { Min } from "class-validator";
import { DetalleReserva } from "./detalle-reserva.entity";

@Entity("atracciones")
export class Atraccion {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "varchar", length: 150 })
  nombre: string;

  @Column({ type: "text" })
  descripcion: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  @Min(0)
  precio_base: number;

  @Column({ type: "int" })
  @Min(1)
  capacidad_diaria: number;

  @Index()
  @Column({ type: "varchar", length: 10 })
  codigo_aeropuerto: string;

  @Column({ type: "text", nullable: true })
  foto_url: string;

  @Column({ type: "varchar", length: 20, default: "ACTIVA" })
  estado: string;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  duracion_horas: number;

  @Column({ type: "jsonb", nullable: true })
  incluye: string[];

  @Column({ type: "text", nullable: true })
  itinerario: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => DetalleReserva, (detalle) => detalle.atraccion)
  detalles_reserva: DetalleReserva[];
}
