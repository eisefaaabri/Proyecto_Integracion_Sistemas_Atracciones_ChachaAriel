import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

@Entity({ schema: "ms_location", name: "provincia" })
export class Provincia {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  prov_id: number;

  @Column({ type: "varchar", length: 60 })
  prov_nombre: string;
}

@Entity({ schema: "ms_location", name: "ciudad" })
export class Ciudad {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  ciu_id: number;

  @Column({ type: "varchar", length: 80 })
  ciu_nombre: string;

  @Column({ type: "smallint" })
  prov_id: number;

  @ManyToOne(() => Provincia)
  @JoinColumn({ name: "prov_id" })
  provincia: Provincia;
}

@Entity({ schema: "ms_location", name: "aeropuerto" })
export class Aeropuerto {
  @PrimaryGeneratedColumn("identity", {
    type: "smallint",
    generatedIdentity: "ALWAYS",
  })
  aer_id: number;

  @Column({ type: "char", length: 3 })
  aer_codigo: string;

  @Column({ type: "varchar", length: 120 })
  aer_nombre: string;

  @Column({ type: "smallint" })
  ciu_id: number;

  @Column({ type: "numeric", precision: 10, scale: 6, transformer: aNumero })
  aer_latitud: number;

  @Column({ type: "numeric", precision: 10, scale: 6, transformer: aNumero })
  aer_longitud: number;

  @Column({ type: "boolean" })
  aer_activo: boolean;

  @ManyToOne(() => Ciudad)
  @JoinColumn({ name: "ciu_id" })
  ciudad: Ciudad;
}
