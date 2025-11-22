import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeminiService } from './gemini.service';
import { QdrantService } from './qdrant.service';
import { AIProcessorService } from './ai-processor.service';
import { AIConsumer } from './ai.consumer';
import { AIController } from './ai.controller';
import { EmailRaw } from '../gmail/entities/email-raw.entity';
import { EmailSummary } from './entities/email-summary.entity';
import { EmailMetadata } from './entities/email-metadata.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailRaw, EmailSummary, EmailMetadata]),
  ],
  controllers: [AIController],
  providers: [GeminiService, QdrantService, AIProcessorService, AIConsumer],
  exports: [GeminiService, QdrantService, AIProcessorService],
})
export class AIModule {}

