import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, logLevel } from 'kafkajs';

/**
 * Kafka service for publishing events
 */
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'email-auth-backend',
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
      logLevel: logLevel.INFO,
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  /**
   * Initialize Kafka producer
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      console.log('Kafka producer connected');
    } catch (error) {
      console.error('Failed to connect Kafka producer:', error);
    }
  }

  /**
   * Disconnect Kafka producer
   */
  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  /**
   * Publish email fetch event
   */
  async publishEmailFetchedEvent(
    userId: number,
    emailIds: number[],
  ): Promise<void> {
    try {
      await this.producer.send({
        topic: process.env.KAFKA_TOPIC_EMAIL_FETCHED || 'email-fetched',
        messages: [
          {
            key: userId.toString(),
            value: JSON.stringify({
              userId,
              emailIds,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      console.log(`Published email fetched event for user ${userId}, ${emailIds.length} emails`);
    } catch (error) {
      console.error('Failed to publish email fetched event:', error);
      throw error;
    }
  }
}

