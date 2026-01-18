import { Injectable, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-grpc';

@Injectable()
export class QdrantService implements OnModuleInit {
  private client: QdrantClient;
  private collectionName = 'emails';

  constructor() {
    const qdrantHost = process.env.QDRANT_HOST || 'localhost';
    const qdrantPort = parseInt(process.env.QDRANT_PORT || '6334');

    this.client = new QdrantClient({
      host: qdrantHost,
      port: qdrantPort,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureCollection();
  }

  private async ensureCollection(): Promise<void> {
    try {
      // 1. Fix: Use api('collections')
      const result = await this.client.api('collections').list({});
      const exists = result.collections.some((c) => c.name === this.collectionName);

      if (!exists) {
        await this.createCollection();
      } else {
        console.log(`Collection ${this.collectionName} exists.`);
      }
    } catch (error: any) {
      console.error('Qdrant connection error:', error.message);
    }
  }

  private async createCollection(): Promise<void> {
    // 2. Fix: Use camelCase 'collectionName'
    await this.client.api('collections').create({
      collectionName: this.collectionName,
      vectorsConfig: {
        config: {
          case: 'params',
          value: {
            size: BigInt(768), // 3. Fix: Size usually expects BigInt or number depending on proto version
            distance: 1, // 1 = Cosine distance in Qdrant Distance enum
          },
        },
      },
    });
    console.log(`Created Qdrant collection: ${this.collectionName}`);
  }

  async storeEmailEmbedding(
    emailId: number,
    embedding: number[],
    payload: any,
  ): Promise<number> {
    try {
      await this.client.api('points').upsert({
        collectionName: this.collectionName,
        wait: true,
        points: [
          {
            // 4. Fix: 'PointId' is a strict oneof wrapper
            id: {
              pointIdOptions: {
                case: 'num',
                value: BigInt(emailId), // 5. Fix: IDs are uint64 (BigInt)
              },
            },
            // 6. Fix: 'Vectors' is a strict oneof wrapper
            vectors: {
              vectorsOptions: {
                case: 'vector',
                value: { data: embedding },
              },
            },
            payload: this.mapPayload(payload),
          },
        ],
      });

      return emailId;
    } catch (error: any) {
      console.error('Failed to store embedding:', error);
      throw new Error(`Qdrant storage failed: ${error.message}`);
    }
  }

  async searchSimilarEmails(
    queryEmbedding: number[],
    userId: number,
    limit: number = 10,
  ): Promise<Array<{ id: number; score: number; payload: any }>> {
    try {
      const threshold = parseFloat(process.env.QDRANT_SCORE_THRESHOLD || '0.1');

      const result = await this.client.api('points').search({
        collectionName: this.collectionName,
        vector: queryEmbedding,
        limit: BigInt(limit), // Limit must be a BigInt
        scoreThreshold: threshold,
        // FIX: Wrap 'enable' inside selectorOptions
        withPayload: {
          selectorOptions: {
            case: 'enable',
            value: true,
          },
        },
        filter: {
          must: [
            {
              conditionOneOf: {
                case: 'field',
                value: {
                  key: 'userId',
                  match: {
                    matchValue: {
                      case: 'integer',
                      value: BigInt(userId), // integer match must be BigInt
                    },
                  },
                },
              },
            },
          ],
        },
      });

      return result.result.map((point) => {
        // Handle Point ID (which is also a OneOf)
        let id = 0;
        if (point.id?.pointIdOptions?.case === 'num') {
          id = Number(point.id.pointIdOptions.value);
        }

        return {
          id: id,
          score: point.score,
          payload: point.payload ? this.mapToObj(point.payload) : {},
        };
      });
    } catch (error: any) {
      console.error('Qdrant search error:', error);
      throw new Error(`Qdrant search failed: ${error.message}`);
    }
  }

  async deleteEmailEmbedding(emailId: number): Promise<void> {
    try {
      await this.client.api('points').delete({
        collectionName: this.collectionName,
        wait: true,
        points: {
          pointsSelectorOneOf: {
            case: 'points',
            value: {
              ids: [
                {
                  pointIdOptions: {
                    case: 'num',
                    value: BigInt(emailId),
                  },
                },
              ],
            },
          },
        },
      });
    } catch (error: any) {
      console.error('Failed to delete embedding:', error);
    }
  }

  // --- Helpers ---

  private mapPayload(payload: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') {
        result[key] = { kind: { case: 'stringValue', value: value } };
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          result[key] = { kind: { case: 'integerValue', value: BigInt(value) } };
        } else {
          result[key] = { kind: { case: 'doubleValue', value: value } };
        }
      } else if (typeof value === 'boolean') {
        result[key] = { kind: { case: 'boolValue', value: value } };
      }
    }
    return result;
  }

  private mapToObj(grpcMap: Record<string, any>): any {
    const result: any = {};
    for (const [key, value] of Object.entries(grpcMap)) {
      if (value.kind?.case === 'stringValue') result[key] = value.kind.value;
      else if (value.kind?.case === 'integerValue')
        result[key] = Number(value.kind.value);
      else if (value.kind?.case === 'doubleValue') result[key] = value.kind.value;
      else if (value.kind?.case === 'boolValue') result[key] = value.kind.value;
    }
    return result;
  }
}