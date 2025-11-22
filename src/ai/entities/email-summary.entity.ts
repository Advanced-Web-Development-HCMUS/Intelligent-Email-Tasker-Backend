import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmailRaw } from '../../gmail/entities/email-raw.entity';

/**
 * Email summary entity
 */
@Entity('email_summary')
export class EmailSummary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  emailRawId: number;

  @ManyToOne(() => EmailRaw, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailRawId' })
  emailRaw: EmailRaw;

  @Column({ type: 'text' })
  summary: string; // AI-generated summary

  @Column({ type: 'text', nullable: true })
  keyPoints: string; // JSON array of key points

  @Column({ type: 'text', nullable: true })
  sentiment: string; // positive, negative, neutral

  @Column({ type: 'text', nullable: true })
  category: string; // work, personal, spam, etc.

  @Column({ type: 'text', nullable: true })
  priority: string; // high, medium, low

  @Column({ type: 'int', nullable: true })
  qdrantId: number; // Qdrant vector ID (integer, not string)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

