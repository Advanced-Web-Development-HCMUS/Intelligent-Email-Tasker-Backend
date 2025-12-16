import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AIProcessorService } from './ai-processor.service';
import { QdrantService } from './qdrant.service';
import { GeminiService } from './gemini.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TBaseDTO } from '../common/dto/base.dto';
import { GGJParseIntPipe } from '../common/pipes/parse-int.pipe';

/**
 * Controller for AI-related endpoints
 */
@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AIController {
  constructor(
    private readonly aiProcessorService: AIProcessorService,
    private readonly qdrantService: QdrantService,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Search emails semantically
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Semantic search for emails' })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    type: TBaseDTO<{ results: any[] }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', example: 'meeting tomorrow' },
        limit: { type: 'number', example: 10 },
      },
      required: ['query'],
    },
  })
  async semanticSearch(
    @Request() req: any,
    @Body() body: { query: string; limit?: number },
  ): Promise<TBaseDTO<{ results: any[] }>> {
    try {
      const userId = req.user.userId;
      const query = body.query;
      const limit = body.limit || 10;

      if (!query) {
        return new TBaseDTO<{ results: any[] }>(
          undefined,
          undefined,
          'Search query is required',
        );
      }

      // Generate embedding for query
      const queryEmbedding = await this.geminiService.generateEmbedding(query);

      // Search in Qdrant
      const qdrantResults = await this.qdrantService.searchSimilarEmails(
        queryEmbedding,
        userId,
        limit * 2, // Get more results to filter and enrich
      );

      // Filter by minimum score and enrich with full email data
      const filteredResults = await Promise.all(
        qdrantResults
          .filter((r) => r.score > 0.5) // Lower threshold for better recall
          .slice(0, limit)
          .map(async (result) => {
            // Get full email data from database
            const emailId = result.payload.emailRawId;
            const email = await this.aiProcessorService.getEmailById(emailId);
            
            if (!email) {
              return null;
            }

            // Get summary if available
            const summary = await this.aiProcessorService.getEmailSummary(emailId);

            return {
              email: {
                id: email.id,
                gmailId: email.gmailId,
                threadId: email.threadId,
                from: email.from,
                fromName: email.fromName,
                to: email.to ? JSON.parse(email.to) : [],
                cc: email.cc ? JSON.parse(email.cc) : [],
                bcc: email.bcc ? JSON.parse(email.bcc) : [],
                subject: email.subject,
                snippet: email.snippet,
                bodyText: email.bodyText,
                bodyHtml: email.bodyHtml,
                isRead: email.isRead,
                isStarred: email.isStarred,
                isImportant: email.isImportant,
                labels: email.labels ? JSON.parse(email.labels) : [],
                receivedAt: email.receivedAt,
                sentAt: email.sentAt,
                status: email.status || 'inbox',
                snoozeUntil: email.snoozeUntil,
                createdAt: email.createdAt,
                updatedAt: email.updatedAt,
                summary: summary
                  ? {
                      summary: summary.summary,
                      keyPoints: summary.keyPoints ? JSON.parse(summary.keyPoints) : [],
                      sentiment: summary.sentiment,
                      category: summary.category,
                      priority: summary.priority,
                    }
                  : null,
              },
              relevanceScore: Math.round(result.score * 100) / 100,
            };
          }),
      );

      // Filter out null results
      const validResults = filteredResults.filter((r) => r !== null);

      return new TBaseDTO<{ results: any[] }>({ results: validResults });
    } catch (error: any) {
      return new TBaseDTO<{ results: any[] }>(
        undefined,
        undefined,
        error.message || 'Search failed',
      );
    }
  }

  /**
   * Manually trigger AI processing for specific emails
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger AI processing for emails' })
  @ApiResponse({
    status: 200,
    description: 'Processing started successfully',
    type: TBaseDTO<{ message: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        emailIds: { type: 'array', items: { type: 'number' } },
      },
      required: ['emailIds'],
    },
  })
  async processEmails(
    @Request() req: any,
    @Body() body: { emailIds: number[] },
  ): Promise<TBaseDTO<{ message: string }>> {
    try {
      const emailIds = body.emailIds;

      if (!emailIds || emailIds.length === 0) {
        return new TBaseDTO<{ message: string }>(
          undefined,
          undefined,
          'Email IDs are required',
        );
      }

      // Process emails asynchronously
      this.aiProcessorService.processEmails(emailIds).catch((error) => {
        console.error('Background processing error:', error);
      });

      return new TBaseDTO<{ message: string }>({
        message: `Processing started for ${emailIds.length} emails`,
      });
    } catch (error: any) {
      return new TBaseDTO<{ message: string }>(
        undefined,
        undefined,
        error.message || 'Processing failed',
      );
    }
  }
}

