import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

// Fila única (id = 1): el acuerdo comercial B2B de la tienda con Booking.
@Entity("contrato_promociones")
export class ContratoPromociones {
  @PrimaryColumn({ type: "smallint", default: 1 })
  id: number;

  @Column({ type: "boolean", default: false })
  permite_promociones: boolean;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  porcentaje_descuento_maximo: number;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  destinos_habilitados: string[];

  @Column({ type: "date", nullable: true })
  fecha_acuerdo: string;

  @Column({ type: "date", nullable: true })
  vigencia_hasta: string;

  @Column({ type: "text", nullable: true })
  condiciones_combo: string;

  @Column({ type: "varchar", length: 150, nullable: true })
  contacto_nombre: string;

  @Column({ type: "varchar", length: 150, nullable: true })
  contacto_email: string;

  @UpdateDateColumn()
  updated_at: Date;
}
