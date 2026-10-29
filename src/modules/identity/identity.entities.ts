import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

@Entity({ schema: "ms_identity", name: "rol" })
export class Rol {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  rol_id: number;

  @Column({ type: "varchar", length: 30 })
  rol_nombre: string;

  @Column({ type: "varchar", length: 200 })
  rol_descripcion: string;

  @Column({ type: "boolean" })
  rol_activo: boolean;
}

@Entity({ schema: "ms_identity", name: "usuario" })
export class Usuario {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  usu_id: number;

  @Column({ type: "uuid", insert: false, update: false })
  usu_uuid: string;

  @Column({ type: "varchar", length: 160 })
  usu_correo: string;

  @Column({ type: "varchar", length: 100, select: false })
  usu_password: string;

  @Column({ type: "varchar", length: 120 })
  usu_nombre: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  usu_apellido: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  usu_documento: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  usu_telefono: string | null;

  @Column({ type: "boolean", default: true })
  usu_activo: boolean;

  @Column({ type: "timestamptz", nullable: true })
  usu_ultimo_acceso: Date | null;

  @Column({ type: "timestamptz", insert: false, update: false })
  usu_creado_en: Date;

  @OneToMany(() => UsuarioRol, (ur) => ur.usuario)
  roles: UsuarioRol[];
}

@Entity({ schema: "ms_identity", name: "usuario_rol" })
export class UsuarioRol {
  @PrimaryColumn({ type: "bigint", transformer: aNumero })
  usu_id: number;

  @PrimaryColumn({ type: "smallint" })
  rol_id: number;

  @Column({ type: "bigint", nullable: true, transformer: aNumero })
  usr_asignado_por: number | null;

  @ManyToOne(() => Usuario, (u) => u.roles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "usu_id" })
  usuario: Usuario;

  @ManyToOne(() => Rol)
  @JoinColumn({ name: "rol_id" })
  rol: Rol;
}
