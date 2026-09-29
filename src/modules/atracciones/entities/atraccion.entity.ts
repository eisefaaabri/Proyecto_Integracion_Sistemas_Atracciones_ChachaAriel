import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum ProductType {
  SINGLE_TICKET = 'SINGLE_TICKET',
  GUIDED_TOUR = 'GUIDED_TOUR',
  PACKAGE = 'PACKAGE',
}

@Entity('atracciones')
export class Atraccion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  long_description: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  duration: string;

  @Column({ type: 'jsonb', nullable: true })
  price: { currency: string; total: number };

  @Column({ type: 'simple-array', nullable: true })
  categories: string[];

  @Column({ type: 'simple-array', nullable: true })
  badges: string[];

  @Column({ type: 'jsonb', nullable: true })
  locations: Array<{
    address: string;
    city: number;
    country: string;
    coordinates: { latitude: number; longitude: number };
    type?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  photos: Array<{ url: string }>;

  @Column({ type: 'jsonb', nullable: true })
  operator: { id: number; name: string };

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.SINGLE_TICKET,
  })
  product_type: ProductType;

  @Column({ type: 'simple-array', nullable: true })
  includes: string[];

  @Column({ type: 'simple-array', nullable: true })
  supported_languages: string[];

  @Column({ type: 'boolean', default: false })
  free_cancellation: boolean;

  @Column({ type: 'jsonb', nullable: true })
  ratings: { number_of_reviews: number; score: number };

  @Column({ type: 'jsonb', nullable: true })
  url: { web: string; app?: string };

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date;
}
