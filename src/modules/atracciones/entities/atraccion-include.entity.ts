import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atraccion } from './atraccion.entity';

@Entity('atraccion_includes')
export class AtraccionInclude {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Atraccion, (a) => a.includes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atraccion_id' })
  atraccion: Atraccion;

  @Column({ type: 'varchar', length: 50 })
  atraccion_id: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;
}
