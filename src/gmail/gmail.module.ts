import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { EmailRaw } from './entities/email-raw.entity';
import { User } from '../auth/entities/user.entity';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailRaw, User]),
    KafkaModule,
  ],
  controllers: [GmailController],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}

