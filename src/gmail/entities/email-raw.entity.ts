import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Email raw entity for storing Gmail emails
 */
@Entity('email_raw')
export class EmailRaw {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  gmailId: string; // Gmail message ID

  @Column({ type: 'text', nullable: true })
  threadId: string; // Gmail thread ID

  @Column({ type: 'text', nullable: true })
  from: string; // Sender email address

  @Column({ type: 'text', nullable: true })
  fromName: string; // Sender name

  @Column({ type: 'text', nullable: true })
  to: string; // Recipient email addresses (JSON array as string)

  @Column({ type: 'text', nullable: true })
  cc: string; // CC email addresses (JSON array as string)

  @Column({ type: 'text', nullable: true })
  bcc: string; // BCC email addresses (JSON array as string)

  @Column({ type: 'text', nullable: true })
  subject: string;

  @Column({ type: 'text', nullable: true })
  snippet: string; // Email preview/snippet

  @Column({ type: 'text', nullable: true })
  bodyText: string; // Plain text body

  @Column({ type: 'text', nullable: true })
  bodyHtml: string; // HTML body

  @Column({ default: false })
  isRead: boolean;

  @Column({ default: false })
  isStarred: boolean;

  @Column({ default: false })
  isImportant: boolean;

  @Column({ type: 'text', nullable: true })
  labels: string; // Gmail labels (JSON array as string)

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date; // Internal date from Gmail

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date; // Date header from email

  @Column({ type: 'text', nullable: true })
  rawData: string; // Full raw email data (JSON)

  @Column({
    type: 'varchar',
    length: 50,
    default: 'inbox',
  })
  status: string; // Kanban status: 'inbox', 'todo', 'in_progress', 'done', 'snoozed'

  @Column({ type: 'timestamp', nullable: true })
  snoozeUntil: Date; // When to restore snoozed email

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

