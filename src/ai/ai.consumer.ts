import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { AIProcessorService } from './ai-processor.service';

/**
 * Kafka consumer for AI processing
 */
@Injectable()
export class AIConsumer implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly aiProcessorService: AIProcessorService) {
    this.kafka = new Kafka({
      clientId: 'ai-processor',
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
      logLevel: logLevel.INFO,
    });

    this.consumer = this.kafka.consumer({
      groupId: 'ai-processor-group',
    });
  }

  /**
   * Initialize Kafka consumer
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      const topic = process.env.KAFKA_TOPIC_EMAIL_FETCHED || 'email-fetched';

      await this.consumer.subscribe({
        topic,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      console.log(`AI Consumer subscribed to topic: ${topic}`);
    } catch (error) {
      console.error('Failed to initialize AI consumer:', error);
    }
  }

  /**
   * Handle incoming Kafka message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    try {
      const message = payload.message;
      if (!message.value) {
        console.warn('Received empty message');
        return;
      }

      const data = JSON.parse(message.value.toString());
      const { userId, emailIds } = data;

      console.log(`Received email fetch event: user ${userId}, ${emailIds.length} emails`);

      // Process emails with AI
      await this.aiProcessorService.processEmails(emailIds);
    } catch (error: any) {
      console.error('Error processing Kafka message:', error);
      // Don't throw - let Kafka handle retries
    }
  }

  /**
   * Disconnect Kafka consumer
   */
  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }
}

