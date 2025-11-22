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
 * Email metadata entity
 */
@Entity('email_metadata')
export class EmailMetadata {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  emailRawId: number;

  @ManyToOne(() => EmailRaw, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailRawId' })
  emailRaw: EmailRaw;

  @Column({ type: 'text', nullable: true })
  entities: string; // JSON array of extracted entities (people, organizations, etc.)

  @Column({ type: 'text', nullable: true })
  topics: string; // JSON array of topics

  @Column({ type: 'text', nullable: true })
  language: string; // Detected language

  @Column({ type: 'int', nullable: true })
  wordCount: number;

  @Column({ type: 'int', nullable: true })
  readingTime: number; // Estimated reading time in seconds

  @Column({ type: 'text', nullable: true })
  tags: string; // JSON array of tags

  @Column({ type: 'text', nullable: true })
  actionItems: string; // JSON array of action items extracted

  @Column({ type: 'boolean', default: false })
  hasAttachment: boolean;

  @Column({ type: 'text', nullable: true })
  attachmentTypes: string; // JSON array of attachment types

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

