import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

export enum EstadoAtraccion {
  BORRADOR = "BORRADOR",
  PUBLICADA = "PUBLICADA",
  INACTIVA = "INACTIVA",
  MANTENIMIENTO = "MANTENIMIENTO",
}

@Entity({ schema: "ms_catalog", name: "categoria" })
export class Categoria {
  @PrimaryGeneratedColumn("identity", {
    type: "int",
    generatedIdentity: "ALWAYS",
  })
  cat_id: number;

  @Column({ type: "uuid", insert: false, update: false })
  cat_uuid: string;

  @Column({ type: "int", nullable: true })
  cat_padre_id: number | null;

  @Column({ type: "varchar", length: 100 })
  cat_nombre: string;

  @Column({ type: "varchar", length: 100 })
  cat_slug: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  cat_descripcion: string | null;

  @Column({ type: "varchar", length: 40 })
  cat_icono: string;

  @Column({ type: "smallint" })
  cat_orden: number;

  @Column({ type: "boolean" })
  cat_activa: boolean;

  @Column({ type: "boolean" })
  cat_incluye_comida: boolean;

  @Column({ type: "boolean" })
  cat_incluye_transporte: boolean;

  @Column({ type: "boolean" })
  cat_incluye_guia: boolean;
}

@Entity({ schema: "ms_catalog", name: "operador" })
export class Operador {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  ope_id: number;

  @Column({ type: "int" })
  ope_codigo: number;

  @Column({ type: "varchar", length: 150 })
  ope_nombre: string;
}

@Entity({ schema: "ms_catalog", name: "operador_usuario" })
export class OperadorUsuario {
  @PrimaryColumn({ type: "bigint", transformer: aNumero })
  ope_id: number;

  @PrimaryColumn({ type: "bigint", transformer: aNumero })
  usu_id: number;

  @Column({ type: "varchar", length: 60 })
  opeu_cargo: string;

  @Column({ type: "boolean", default: true })
  opeu_activo: boolean;
}

@Entity({ schema: "ms_catalog", name: "idioma" })
export class Idioma {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  idi_id: number;

  @Column({ type: "char", length: 2 })
  idi_codigo: string;

  @Column({ type: "varchar", length: 50 })
  idi_nombre: string;
}

@Entity({ schema: "ms_catalog", name: "inclusion" })
export class Inclusion {
  @PrimaryGeneratedColumn("identity", {
    type: "int",
    generatedIdentity: "ALWAYS",
  })
  inc_id: number;

  @Column({ type: "varchar", length: 20 })
  inc_tipo: string;

  @Column({ type: "varchar", length: 150 })
  inc_nombre: string;

  @Column({ type: "smallint", default: 0 })
  inc_orden: number;
}

@Entity({ schema: "ms_catalog", name: "atraccion" })
export class Atraccion {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  atr_id: number;

  // Se genera en la base; solo se envía al crear si se quiere conservar uno existente.
  @Column({ type: "uuid", update: false })
  atr_uuid: string;

  @Column({ type: "varchar", length: 200 })
  atr_nombre: string;

  @Column({ type: "varchar", length: 220 })
  atr_slug: string;

  @Column({ type: "text" })
  atr_descripcion: string;

  @Column({ type: "varchar", length: 30 })
  atr_tipo: string;

  @Column({ type: "varchar", length: 20 })
  atr_estado: EstadoAtraccion;

  @Column({ type: "numeric", precision: 10, scale: 6, transformer: aNumero })
  atr_latitud: number;

  @Column({ type: "numeric", precision: 10, scale: 6, transformer: aNumero })
  atr_longitud: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  atr_punto_encuentro: string | null;

  @Column({
    type: "numeric",
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: aNumero,
  })
  atr_duracion_horas: number | null;

  @Column({ type: "char", length: 3 })
  atr_codigo_aeropuerto: string;

  @Column({ type: "smallint" })
  ciu_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  ope_id: number;

  @Column({ type: "text", nullable: true })
  atr_itinerario: string | null;

  @Column({ type: "numeric", precision: 3, scale: 2, transformer: aNumero })
  atr_calificacion_promedio: number;

  @Column({ type: "int" })
  atr_numero_resenas: number;

  @Column({ type: "timestamptz", insert: false, update: false })
  atr_creado_en: Date;

  @Column({ type: "timestamptz", insert: false, update: false })
  atr_actualizado_en: Date;

  @Column({ type: "timestamptz", nullable: true })
  atr_eliminado_en: Date | null;

  @OneToMany(() => AtraccionFoto, (f) => f.atraccion)
  fotos: AtraccionFoto[];

  @ManyToMany(() => Inclusion)
  @JoinTable({
    schema: "ms_catalog",
    name: "atraccion_inclusion",
    joinColumn: { name: "atr_id", referencedColumnName: "atr_id" },
    inverseJoinColumn: { name: "inc_id", referencedColumnName: "inc_id" },
  })
  inclusiones: Inclusion[];

  @ManyToMany(() => Categoria)
  @JoinTable({
    schema: "ms_catalog",
    name: "atraccion_categoria",
    joinColumn: { name: "atr_id", referencedColumnName: "atr_id" },
    inverseJoinColumn: { name: "cat_id", referencedColumnName: "cat_id" },
  })
  categorias: Categoria[];

  @ManyToMany(() => Idioma)
  @JoinTable({
    schema: "ms_catalog",
    name: "atraccion_idioma",
    joinColumn: { name: "atr_id", referencedColumnName: "atr_id" },
    inverseJoinColumn: { name: "idi_id", referencedColumnName: "idi_id" },
  })
  idiomas: Idioma[];
}

@Entity({ schema: "ms_catalog", name: "atraccion_foto" })
export class AtraccionFoto {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  fot_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "varchar", length: 500 })
  fot_url: string;

  @Column({ type: "varchar", length: 200 })
  fot_alt: string;

  @Column({ type: "smallint", default: 0 })
  fot_orden: number;

  @ManyToOne(() => Atraccion, (a) => a.fotos, { onDelete: "CASCADE" })
  @JoinColumn({ name: "atr_id" })
  atraccion: Atraccion;
}

// Adaptación Ecuatravel: wishlist.
@Entity({ schema: "ms_catalog", name: "favorito" })
export class Favorito {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  fav_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  usu_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  atr_id: number;

  @Column({ type: "timestamptz", insert: false, update: false })
  fav_creado_en: Date;

  @ManyToOne(() => Atraccion, { onDelete: "CASCADE" })
  @JoinColumn({ name: "atr_id" })
  atraccion: Atraccion;
}
