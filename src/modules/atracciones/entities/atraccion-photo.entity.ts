import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atraccion } from './atraccion.entity';

@Entity('atraccion_photos')
export class AtraccionPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Atraccion, (a) => a.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atraccion_id' })
  atraccion: Atraccion;

  @Column({ type: 'uuid' })
  atraccion_id: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'int', default: 0 })
  display_order: number;
}
