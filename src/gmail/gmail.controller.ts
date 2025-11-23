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
  Res,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { GmailService } from './gmail.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FetchEmailsDto } from './dto/fetch-emails.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { TBaseDTO } from '../common/dto/base.dto';
import { GGJParseIntPipe } from '../common/pipes/parse-int.pipe';

/**
 * Controller for Gmail integration endpoints
 */
@ApiTags('Gmail')
@Controller('gmail')
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  /**
   * Generate OAuth authorization URL
   */
  @Get('oauth/url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Google OAuth authorization URL' })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
    type: TBaseDTO<{ url: string; state: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAuthUrl(
    @Request() req: any,
  ): Promise<TBaseDTO<{ url: string; state: string }>> {
    const userId = req.user.userId;
    const result = this.gmailService.generateAuthUrl(userId);
    return new TBaseDTO<{ url: string; state: string }>(result);
  }

  /**
   * Handle OAuth callback (redirect from Google)
   */
  @Get('oauth/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiQuery({ name: 'code', description: 'Authorization code from Google' })
  @ApiQuery({ name: 'state', description: 'State parameter', required: false })
  @ApiResponse({
    status: 200,
    description: 'OAuth callback processed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid authorization code' })
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<any> {
    if (!code) {
      throw new BadRequestException('Missing authorization code');
    }
  
    // Exchange code for tokens
    const tokens = await this.gmailService.exchangeCodeForTokens(code);
  
    // (OPTIONAL) Save tokens to DB here
    // await this.gmailService.saveTokens(userId, tokens);
  
    return {
      message: "OAuth success",
      tokens,
      state,
    };
  }

  /**
   * Exchange authorization code for tokens (API endpoint)
   */
  @Post('oauth/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange authorization code for access and refresh tokens' })
  @ApiResponse({
    status: 200,
    description: 'Tokens retrieved successfully',
    type: TBaseDTO<{ accessToken: string; refreshToken?: string; expiresIn?: number }>,
  })
  @ApiResponse({ status: 400, description: 'Invalid authorization code' })
  async exchangeToken(
    @Body() callbackDto: OAuthCallbackDto,
  ): Promise<TBaseDTO<{ accessToken: string; refreshToken?: string; expiresIn?: number }>> {
    try {
      const tokens = await this.gmailService.exchangeCodeForTokens(callbackDto.code);
      return new TBaseDTO<{ accessToken: string; refreshToken?: string; expiresIn?: number }>(
        tokens,
      );
    } catch (error: any) {
      return new TBaseDTO<{ accessToken: string; refreshToken?: string; expiresIn?: number }>(
        undefined,
        undefined,
        error.message || 'Failed to exchange code for tokens',
      );
    }
  }

  /**
   * Fetch emails from Gmail and store in database
   */
  @Post('fetch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch emails from Gmail and store in database' })
  @ApiResponse({
    status: 200,
    description: 'Emails fetched and stored successfully',
    type: TBaseDTO<{ count: number; message: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async fetchEmails(
    @Request() req: any,
    @Body() fetchEmailsDto: FetchEmailsDto,
  ): Promise<TBaseDTO<{ count: number; message: string }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.fetchAndStoreEmails(
      userId,
      fetchEmailsDto.accessToken,
      fetchEmailsDto.refreshToken,
      fetchEmailsDto.maxResults || 50,
    );

    if (result.success) {
      return new TBaseDTO<{ count: number; message: string }>({
        count: result.count,
        message: result.message,
      });
    } else {
      return new TBaseDTO<{ count: number; message: string }>(
        undefined,
        undefined,
        result.message,
      );
    }
  }

  /**
   * Get stored emails from database
   */
  @Get('emails')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get stored emails from database' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Stored emails retrieved successfully',
    type: TBaseDTO<{ emails: any[]; total: number; page: number; limit: number }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStoredEmails(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<TBaseDTO<{ emails: any[]; total: number; page: number; limit: number }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    if (pageNum < 1 || limitNum < 1) {
      return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number }>(
        undefined,
        undefined,
        'Page and limit must be positive numbers',
      );
    }

    const result = await this.gmailService.getStoredEmails(userId, pageNum, limitNum);
    return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number }>(result);
  }

  /**
   * Get list of mailboxes (Inbox, Sent, etc.)
   */
  @Get('mailboxes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list of mailboxes' })
  @ApiResponse({
    status: 200,
    description: 'Mailboxes retrieved successfully',
    type: TBaseDTO<{ mailboxes: Array<{ id: string; name: string; count: number; unreadCount: number }> }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMailboxes(
    @Request() req: any,
  ): Promise<TBaseDTO<{ mailboxes: Array<{ id: string; name: string; count: number; unreadCount: number }> }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.getMailboxes(userId);
    return new TBaseDTO<{ mailboxes: Array<{ id: string; name: string; count: number; unreadCount: number }> }>(result);
  }

  /**
   * Get emails in a specific mailbox
   */
  @Get('mailboxes/:id/emails')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get emails in a mailbox' })
  @ApiParam({ name: 'id', description: 'Mailbox ID (e.g., INBOX, SENT, DRAFT)', example: 'INBOX' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Filter by read status' })
  @ApiQuery({ name: 'isStarred', required: false, type: Boolean, description: 'Filter by starred status' })
  @ApiResponse({
    status: 200,
    description: 'Emails retrieved successfully',
    type: TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; mailbox: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Mailbox not found' })
  async getEmailsByMailbox(
    @Request() req: any,
    @Param('id') mailboxId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isRead') isRead?: string,
    @Query('isStarred') isStarred?: string,
  ): Promise<TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; mailbox: string }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    if (pageNum < 1 || limitNum < 1) {
      return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; mailbox: string }>(
        undefined,
        undefined,
        'Page and limit must be positive numbers',
      );
    }

    const filters: { isRead?: boolean; isStarred?: boolean } = {};
    if (isRead !== undefined) {
      filters.isRead = isRead === 'true';
    }
    if (isStarred !== undefined) {
      filters.isStarred = isStarred === 'true';
    }

    const result = await this.gmailService.getEmailsByMailbox(
      userId,
      mailboxId,
      pageNum,
      limitNum,
      filters,
    );

    return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; mailbox: string }>(result);
  }

  /**
   * Get email detail by ID
   */
  @Get('emails/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get email detail by ID' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Email detail retrieved successfully',
    type: TBaseDTO<any>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async getEmailDetail(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
  ): Promise<TBaseDTO<any>> {
    const userId = req.user.userId;
    const email = await this.gmailService.getEmailDetail(userId, emailId);

    if (!email) {
      return new TBaseDTO<any>(
        undefined,
        undefined,
        'Email not found',
      );
    }

    return new TBaseDTO<any>(email);
  }
}

