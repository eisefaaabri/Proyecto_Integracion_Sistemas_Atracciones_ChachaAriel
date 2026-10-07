import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Min, Max } from "class-validator";
import { Atraccion } from "./atraccion.entity";
import { Cliente } from "./cliente.entity";

@Entity("resenas")
export class Resena {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "int" })
  @Min(1)
  @Max(5)
  score: number;

  @Column({ type: "text" })
  comment: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Index()
  @ManyToOne(() => Atraccion, { onDelete: "CASCADE" })
  @JoinColumn({ name: "atraccion_id" })
  atraccion: Atraccion;

  @ManyToOne(() => Cliente, { onDelete: "CASCADE" })
  @JoinColumn({ name: "cliente_id" })
  cliente: Cliente;
}
