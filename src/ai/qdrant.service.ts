import { Injectable, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Service for Qdrant vector database integration
 */
@Injectable()
export class QdrantService implements OnModuleInit {
  private client: QdrantClient;
  private collectionName = 'emails';

  constructor() {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    this.client = new QdrantClient({ url: qdrantUrl });
  }

  /**
   * Initialize Qdrant collection
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureCollection();
      console.log('Qdrant collection initialized');
    } catch (error) {
      console.error('Failed to initialize Qdrant:', error);
    }
  }

  /**
   * Ensure collection exists
   */
  private async ensureCollection(): Promise<void> {
    try {
      // Check if Qdrant is accessible
      try {
        await this.client.getCollections();
      } catch (error: any) {
        console.error('Cannot connect to Qdrant:', error.message);
        console.error('Please ensure Qdrant is running: docker-compose up -d qdrant');
        throw new Error(`Qdrant connection failed: ${error.message}`);
      }

      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName,
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: 3072, // Embedding dimension (can be adjusted based on embedding model)
            distance: 'Cosine',
          },
        });
        console.log(`Created Qdrant collection: ${this.collectionName}`);
      } else {
        console.log(`Qdrant collection ${this.collectionName} already exists`);
      }
    } catch (error: any) {
      if (error.status === 409 || error.message?.includes('already exists')) {
        // Collection already exists, that's fine
        console.log(`Qdrant collection ${this.collectionName} already exists`);
      } else {
        console.error('Failed to ensure Qdrant collection:', error);
        throw error;
      }
    }
  }

  /**
   * Store email embedding in Qdrant
   * @param emailId - Email ID (must be positive integer)
   * @param embedding - Vector embedding array
   * @param payload - Metadata to store with the embedding
   * @returns The point ID (integer) used in Qdrant
   */
  async storeEmailEmbedding(
    emailId: number,
    embedding: number[],
    payload: {
      emailRawId: number;
      subject: string;
      summary: string;
      from: string;
      userId: number;
    },
  ): Promise<number> {
    try {
      await this.ensureCollection();

      // Qdrant only accepts integer or UUID for point IDs, not strings
      // Use emailId directly as integer point ID
      if (!Number.isInteger(emailId) || emailId <= 0) {
        throw new Error(`Invalid emailId: ${emailId}. Must be a positive integer.`);
      }

      const pointId: number = emailId;

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: pointId, // Integer ID, not string
            vector: embedding,
            payload: {
              emailRawId: payload.emailRawId,
              subject: payload.subject,
              summary: payload.summary,
              from: payload.from,
              userId: payload.userId,
              timestamp: new Date().toISOString(),
            },
          },
        ],
      });

      console.log(`Successfully stored embedding in Qdrant for email ${emailId} with point ID ${pointId}`);
      return pointId; // Return integer, not string
    } catch (error: any) {
      console.error('Failed to store embedding in Qdrant:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        emailId,
        embeddingSize: embedding.length,
      });
      throw new Error(`Qdrant storage failed: ${error.message}`);
    }
  }

  /**
   * Search similar emails
   */
  async searchSimilarEmails(
    queryEmbedding: number[],
    userId: number,
    limit: number = 10,
  ): Promise<
    Array<{
      id: number; // Changed from string to number since we use integer IDs
      score: number;
      payload: any;
    }>
  > {
    try {
      const result = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        filter: {
          must: [
            {
              key: 'userId',
              match: { value: userId },
            },
          ],
        },
      });

      return result.map((point) => ({
        id: point.id as number, // Qdrant returns integer ID
        score: point.score || 0,
        payload: point.payload || {},
      }));
    } catch (error: any) {
      console.error('Qdrant search error:', error);
      throw new Error(`Qdrant search failed: ${error.message}`);
    }
  }

  /**
   * Delete email embedding
   */
  async deleteEmailEmbedding(emailId: number): Promise<void> {
    try {
      // Use numeric ID to match storeEmailEmbedding
      const pointId = emailId;
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [pointId],
      });
    } catch (error: any) {
      console.error('Failed to delete embedding from Qdrant:', error);
    }
  }
}

