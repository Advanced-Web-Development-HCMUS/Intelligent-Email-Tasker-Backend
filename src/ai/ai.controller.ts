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
      const results = await this.qdrantService.searchSimilarEmails(
        queryEmbedding,
        userId,
        limit,
      );

      const filteredResults = results.filter(r => r.score > 0.5);

      return new TBaseDTO<{ results: any[] }>({ results: filteredResults });
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

