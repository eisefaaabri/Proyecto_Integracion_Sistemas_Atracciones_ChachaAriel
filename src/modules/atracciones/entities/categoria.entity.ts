import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";

@Entity("categorias")
export class Categoria {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 100 })
  nombre: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 100, unique: true })
  slug: string;

  @Column({ type: "text", nullable: true })
  descripcion: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  icono: string;

  @Column({ type: "boolean", default: false })
  incluye_comida: boolean;

  @Column({ type: "boolean", default: false })
  incluye_transporte: boolean;

  @Column({ type: "boolean", default: false })
  incluye_guia: boolean;

  @Column({ type: "int", default: 0 })
  orden: number;

  @Index()
  @Column({ type: "uuid", nullable: true })
  padre_id: string;

  @ManyToOne(() => Categoria, (categoria) => categoria.subcategorias, {
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "padre_id" })
  padre: Categoria;

  @OneToMany(() => Categoria, (categoria) => categoria.padre)
  subcategorias: Categoria[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
