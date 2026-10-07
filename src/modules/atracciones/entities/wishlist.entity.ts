import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Atraccion } from "./atraccion.entity";
import { Cliente } from "./cliente.entity";

@Entity("wishlists")
@Index(["cliente", "atraccion"], { unique: true }) // Un cliente no puede tener la misma atracción duplicada en su wishlist
export class Wishlist {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @CreateDateColumn()
  added_at: Date;

  @ManyToOne(() => Atraccion, { onDelete: "CASCADE" })
  @JoinColumn({ name: "atraccion_id" })
  atraccion: Atraccion;

  @ManyToOne(() => Cliente, { onDelete: "CASCADE" })
  @JoinColumn({ name: "cliente_id" })
  cliente: Cliente;
}
