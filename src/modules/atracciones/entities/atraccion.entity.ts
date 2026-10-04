import {
  Column,
  Entity,
  PrimaryColumn,
  BeforeInsert,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Unique,
  Check,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Operator } from './operator.entity';
import { Category } from './category.entity';
import { Badge } from './badge.entity';
import { Language } from './language.entity';
import { AtraccionLocation } from './atraccion-location.entity';
import { AtraccionPhoto } from './atraccion-photo.entity';
import { AtraccionInclude } from './atraccion-include.entity';

export enum ProductType {
  SINGLE_TICKET = 'SINGLE_TICKET',
  GUIDED_TOUR = 'GUIDED_TOUR',
  PACKAGE = 'PACKAGE',
}

@Entity('atracciones')
@Unique('UQ_atraccion_name_operator', ['name', 'operator_id'])
@Check('CHK_price_positive', '"price_total" > 0')
@Check('CHK_rating_range', '"rating_score" IS NULL OR ("rating_score" >= 0 AND "rating_score" <= 5)')
@Check('CHK_rating_count', '"rating_count" >= 0')
export class Atraccion {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      const { v4: uuidv4 } = require('uuid');
      this.id = `ATR_${uuidv4()}`;
    }
  }

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  long_description: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  duration: string;

  // ═══════════════════════════════════════════════════════════════════
  //  Precio — 1FN: Atributos atómicos (antes era JSONB compuesto)
  // ═══════════════════════════════════════════════════════════════════

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  price_currency: string;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  price_total: number;

  // ═══════════════════════════════════════════════════════════════════
  //  Operador — 3FN: FK elimina dependencia transitiva
  // ═══════════════════════════════════════════════════════════════════

  @ManyToOne(() => Operator, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'operator_id' })
  operator: Operator;

  @Column({ type: 'int' })
  operator_id: number;

  // ═══════════════════════════════════════════════════════════════════
  //  Tipo de producto — Restricción de dominio (enum)
  // ═══════════════════════════════════════════════════════════════════

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.SINGLE_TICKET,
  })
  product_type: ProductType;

  @Column({ type: 'boolean', default: false })
  free_cancellation: boolean;

  // ═══════════════════════════════════════════════════════════════════
  //  Ratings — 1FN: Atributos atómicos (antes era JSONB compuesto)
  // ═══════════════════════════════════════════════════════════════════

  @Column('numeric', {
    precision: 3,
    scale: 1,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  rating_score: number;

  @Column({ type: 'int', default: 0 })
  rating_count: number;

  // ═══════════════════════════════════════════════════════════════════
  //  URLs — 1FN: Atributos atómicos (antes era JSONB compuesto)
  // ═══════════════════════════════════════════════════════════════════

  @Column({ type: 'varchar', length: 2048, nullable: true })
  url_web: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  url_app: string;

  // ═══════════════════════════════════════════════════════════════════
  //  Relaciones 1:N — 1FN: Elimina grupos repetidos (JSONB arrays)
  // ═══════════════════════════════════════════════════════════════════

  @OneToMany(() => AtraccionLocation, (loc) => loc.atraccion, {
    cascade: true,
    eager: true,
  })
  locations: AtraccionLocation[];

  @OneToMany(() => AtraccionPhoto, (p) => p.atraccion, {
    cascade: true,
    eager: true,
  })
  photos: AtraccionPhoto[];

  @OneToMany(() => AtraccionInclude, (inc) => inc.atraccion, {
    cascade: true,
    eager: true,
  })
  includes: AtraccionInclude[];

  // ═══════════════════════════════════════════════════════════════════
  //  Relaciones N:M — 1FN: Elimina simple-array → tablas pivote
  // ═══════════════════════════════════════════════════════════════════

  @ManyToMany(() => Category, { cascade: true, eager: true })
  @JoinTable({ name: 'atraccion_categories' })
  categories: Category[];

  @ManyToMany(() => Badge, { cascade: true, eager: true })
  @JoinTable({ name: 'atraccion_badges' })
  badges: Badge[];

  @ManyToMany(() => Language, { cascade: true, eager: true })
  @JoinTable({ name: 'atraccion_languages' })
  supported_languages: Language[];

  // ═══════════════════════════════════════════════════════════════════
  //  Auditoría y Soft Delete
  // ═══════════════════════════════════════════════════════════════════

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date;
}
