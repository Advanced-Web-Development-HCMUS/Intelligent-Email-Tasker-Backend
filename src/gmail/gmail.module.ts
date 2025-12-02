import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { EmailRaw } from './entities/email-raw.entity';
import { GmailToken } from './entities/gmail-token.entity';
import { User } from '../auth/entities/user.entity';
import { KafkaModule } from '../kafka/kafka.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailRaw, GmailToken, User]),
    KafkaModule,
    AuthModule,
  ],
  controllers: [GmailController],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}

