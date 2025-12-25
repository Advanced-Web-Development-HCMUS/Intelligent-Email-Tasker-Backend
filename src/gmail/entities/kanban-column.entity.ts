import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Kanban column configuration entity
 * Allows users to customize their Kanban board columns
 */
@Entity('kanban_columns')
@Index(['userId', 'order'], { unique: false })
export class KanbanColumn {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string; // Column name (e.g., "To Do", "In Progress")

  @Column({ type: 'varchar', length: 50, unique: false })
  statusId: string; // Unique identifier for the column (e.g., "todo", "in_progress")

  @Column({ type: 'int', default: 0 })
  order: number; // Display order

  @Column({ type: 'varchar', length: 50, nullable: true })
  gmailLabel: string; // Gmail label to map to (e.g., "STARRED", "IMPORTANT", or custom label)

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Whether column is active/visible

  @Column({ type: 'boolean', default: false })
  isDefault: boolean; // Whether this is a default system column

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

