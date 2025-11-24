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
 * Gmail OAuth token entity for storing Google refresh tokens securely
 */
@Entity('gmail_tokens')
@Index(['userId'], { unique: true }) // One token per user
export class GmailToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  refreshToken: string; // Google OAuth refresh token (encrypted in production)

  @Column({ type: 'text', nullable: true })
  accessToken: string; // Current access token (temporary)

  @Column({ type: 'timestamp', nullable: true })
  accessTokenExpiry: Date; // When access token expires

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

