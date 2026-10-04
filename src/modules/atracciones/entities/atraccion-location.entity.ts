import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Atraccion } from './atraccion.entity';

@Entity('atraccion_locations')
@Check('CHK_latitude_range', '"latitude" >= -90 AND "latitude" <= 90')
@Check('CHK_longitude_range', '"longitude" >= -180 AND "longitude" <= 180')
export class AtraccionLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Atraccion, (a) => a.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atraccion_id' })
  atraccion: Atraccion;

  @Column({ type: 'uuid' })
  atraccion_id: string;

  @Column({ type: 'varchar', length: 500 })
  address: string;

  @Column({ type: 'int' })
  city: number;

  @Column({ type: 'varchar', length: 10 })
  country: string;

  @Column('numeric', {
    precision: 10,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  latitude: number;

  @Column('numeric', {
    precision: 10,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  longitude: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string;
}
