import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { GmailSchedulerService } from './gmail-scheduler.service';
import { EmailRaw } from './entities/email-raw.entity';
import { GmailToken } from './entities/gmail-token.entity';
import { KanbanColumn } from './entities/kanban-column.entity';
import { User } from '../auth/entities/user.entity';
import { EmailSummary } from '../ai/entities/email-summary.entity';
import { KafkaModule } from '../kafka/kafka.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailRaw, GmailToken, KanbanColumn, User, EmailSummary]),
    KafkaModule,
    AIModule,
  ],
  controllers: [GmailController],
  providers: [GmailService, GmailSchedulerService],
  exports: [GmailService],
})
export class GmailModule {}

