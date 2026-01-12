import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
  Param,
  Req,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { GmailService } from './gmail.service';
import { GeminiService } from '../ai/gemini.service';
import { QdrantService } from '../ai/qdrant.service';
import { AIProcessorService } from '../ai/ai-processor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FetchEmailsDto } from './dto/fetch-emails.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ForwardEmailDto } from './dto/forward-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
import { UpdateEmailStatusDto, KanbanStatus } from './dto/update-email-status.dto';
import { SnoozeEmailDto } from './dto/snooze-email.dto';
import { CreateKanbanColumnDto } from './dto/create-kanban-column.dto';
import { UpdateKanbanColumnDto } from './dto/update-kanban-column.dto';
import { TBaseDTO } from '../common/dto/base.dto';
import { GGJParseIntPipe } from '../common/pipes/parse-int.pipe';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';

/**
 * Controller for Gmail integration endpoints
 */
@ApiTags('Gmail')
@Controller('gmail')
export class GmailController {
  constructor(
    private readonly gmailService: GmailService,
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly qdrantService: QdrantService,
    private readonly aiProcessorService: AIProcessorService,
  ) {}

  /**
   * Initiate Gmail OAuth flow
   * Redirects user to Google consent screen
   * Accepts JWT token via query parameter since redirect doesn't support headers
   */
  @Get('auth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Initiate Gmail OAuth2 flow',
    description:
      'Redirects user to Google OAuth2 consent screen for Gmail access',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'JWT access token (alternative to Authorization header)',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google OAuth consent screen',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async initiateGmailAuth(
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      `${this.configService.get<string>('GOOGLE_REDIRECT_URI')}`,
    );

    // Generate auth URL with Gmail scopes
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      state: userId.toString(), // Pass userId in state to retrieve after callback
      prompt: 'consent',
    });

    res.redirect(authUrl);
  }

  /**
   * Gmail OAuth callback
   * Handles the callback from Google after user authorizes
   */
  @Get('callback')
  @ApiExcludeEndpoint()
  async handleGmailCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    try {
      if (!code) {
        return res.redirect(`${frontendUrl}/dashboard?gmail_error=no_code`);
      }

      const userId = parseInt(state, 10);
      if (!userId || isNaN(userId)) {
        return res.redirect(
          `${frontendUrl}/dashboard?gmail_error=invalid_state`,
        );
      }

      // Exchange authorization code for tokens
      const oauth2Client = new google.auth.OAuth2(
        this.configService.get<string>('GOOGLE_CLIENT_ID'),
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
        `${this.configService.get<string>('GOOGLE_REDIRECT_URI')}`,
      );

      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        return res.redirect(`${frontendUrl}/dashboard?gmail_error=no_token`);
      }

      // Get user email from Google
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      // Save tokens to database
      await this.gmailService.saveGmailTokens(
        userId,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expiry_date,
        userInfo.data.email,
      );

      // Redirect to dashboard with success
      res.redirect(`${frontendUrl}/dashboard?gmail_connected=true`);
    } catch (error) {
      console.error('Gmail OAuth callback error:', error);
      res.redirect(`${frontendUrl}/dashboard?gmail_error=callback_failed`);
    }
  }

  /**
   * Check Gmail connection status
   */
  @Get('connection/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if Gmail is connected for current user' })
  @ApiResponse({
    status: 200,
    description: 'Gmail connection status',
    type: TBaseDTO<{ connected: boolean; email?: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGmailConnectionStatus(
    @Request() req: any,
  ): Promise<TBaseDTO<{ connected: boolean; email?: string }>> {
    const userId = req.user.userId;
    const status = await this.gmailService.checkGmailConnection(userId);
    return new TBaseDTO<{ connected: boolean; email?: string }>(status);
  }

  /**
   * Disconnect Gmail
   */
  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect Gmail account' })
  @ApiResponse({
    status: 200,
    description: 'Gmail disconnected successfully',
    type: TBaseDTO<{ success: boolean }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async disconnectGmail(
    @Request() req: any,
  ): Promise<TBaseDTO<{ success: boolean }>> {
    const userId = req.user.userId;
    await this.gmailService.deleteGmailTokens(userId);
    return new TBaseDTO<{ success: boolean }>({ success: true });
  }

  /**
   * Check Gmail connection status (legacy endpoint)
   * @deprecated Use /gmail/connection/status instead
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if Gmail is connected for current user' })
  @ApiResponse({
    status: 200,
    description: 'Gmail connection status',
    type: TBaseDTO<{ connected: boolean; email?: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGmailStatus(
    @Request() req: any,
  ): Promise<TBaseDTO<{ connected: boolean; email?: string }>> {
    const userId = req.user.userId;
    const status = await this.gmailService.checkGmailConnection(userId);
    return new TBaseDTO<{ connected: boolean; email?: string }>(status);
  }

  /**
   * Sync emails from Gmail - fetch and store in database
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync emails from Gmail to database' })
  @ApiResponse({
    status: 200,
    description: 'Emails synced successfully',
    type: TBaseDTO<{ synced: number; message: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async syncEmails(
    @Request() req: any,
  ): Promise<TBaseDTO<{ synced: number; message: string }>> {
      const userId = req.user.userId;
    const result = await this.gmailService.fetchAndStoreEmails(userId, 10);

    if (result.success) {
      return new TBaseDTO<{ synced: number; message: string }>({
        synced: result.count,
        message: result.message,
      });
    } else {
      return new TBaseDTO<{ synced: number; message: string }>(
        undefined,
        undefined,
        result.message,
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
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Stored emails retrieved successfully',
    type: TBaseDTO<{
      emails: any[];
      total: number;
      page: number;
      limit: number;
    }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStoredEmails(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<
    TBaseDTO<{ emails: any[]; total: number; page: number; limit: number }>
  > {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    if (pageNum < 1 || limitNum < 1) {
      return new TBaseDTO<{
        emails: any[];
        total: number;
        page: number;
        limit: number;
      }>(undefined, undefined, 'Page and limit must be positive numbers');
    }

    const result = await this.gmailService.getStoredEmails(
      userId,
      pageNum,
      limitNum,
    );
    return new TBaseDTO<{
      emails: any[];
      total: number;
      page: number;
      limit: number;
    }>(result);
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
    type: TBaseDTO<{
      mailboxes: Array<{
        id: string;
        name: string;
        count: number;
        unreadCount: number;
      }>;
    }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMailboxes(@Request() req: any): Promise<
    TBaseDTO<{
      mailboxes: Array<{
        id: string;
        name: string;
        count: number;
        unreadCount: number;
      }>;
    }>
  > {
    const userId = req.user.userId;
    const result = await this.gmailService.getMailboxes(userId);
    return new TBaseDTO<{
      mailboxes: Array<{
        id: string;
        name: string;
        count: number;
        unreadCount: number;
      }>;
    }>(result);
  }

  /**
   * Get emails in a specific mailbox
   */
  @Get('mailboxes/:id/emails')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get emails in a mailbox' })
  @ApiParam({
    name: 'id',
    description: 'Mailbox ID (e.g., INBOX, SENT, DRAFT)',
    example: 'INBOX',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'isRead',
    required: false,
    type: Boolean,
    description: 'Filter by read status',
  })
  @ApiQuery({
    name: 'isStarred',
    required: false,
    type: Boolean,
    description: 'Filter by starred status',
  })
  @ApiResponse({
    status: 200,
    description: 'Emails retrieved successfully',
    type: TBaseDTO<{
      emails: any[];
      total: number;
      page: number;
      limit: number;
      mailbox: string;
    }>,
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
  ): Promise<
    TBaseDTO<{
      emails: any[];
      total: number;
      page: number;
      limit: number;
      mailbox: string;
    }>
  > {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    if (pageNum < 1 || limitNum < 1) {
      return new TBaseDTO<{
        emails: any[];
        total: number;
        page: number;
        limit: number;
        mailbox: string;
      }>(undefined, undefined, 'Page and limit must be positive numbers');
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

    return new TBaseDTO<{
      emails: any[];
      total: number;
      page: number;
      limit: number;
      mailbox: string;
    }>(result);
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
      return new TBaseDTO<any>(undefined, undefined, 'Email not found');
    }

    return new TBaseDTO<any>(email);
  }

  /**
   * Send email
   */
  @Post('emails/send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send email via Gmail API' })
  @ApiResponse({
    status: 200,
    description: 'Email sent successfully',
    type: TBaseDTO<{ messageId: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async sendEmail(
    @Request() req: any,
    @Body() sendEmailDto: SendEmailDto,
  ): Promise<TBaseDTO<{ messageId: string }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.sendEmail(
      userId,
      sendEmailDto.to,
      sendEmailDto.subject,
      sendEmailDto.body,
      sendEmailDto.cc,
      sendEmailDto.bcc,
    );

    if (result.success && result.messageId) {
      return new TBaseDTO<{ messageId: string }>({
        messageId: result.messageId,
      });
    } else {
      return new TBaseDTO<{ messageId: string }>(
        undefined,
        undefined,
        result.error || 'Failed to send email',
      );
    }
  }

  /**
   * Reply to email
   */
  @Post('emails/:id/reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply to an email' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Reply sent successfully',
    type: TBaseDTO<{ messageId: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async replyToEmail(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
    @Body() replyEmailDto: ReplyEmailDto,
  ): Promise<TBaseDTO<{ messageId: string }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.replyToEmail(
      userId,
      emailId,
      replyEmailDto.body,
    );

    if (result.success && result.messageId) {
      return new TBaseDTO<{ messageId: string }>({
        messageId: result.messageId,
      });
    } else {
      return new TBaseDTO<{ messageId: string }>(
        undefined,
        undefined,
        result.error || 'Failed to reply to email',
      );
    }
  }

  /**
   * Forward an email to new recipients
   */
  @Post('emails/:id/forward')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forward an email' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Email forwarded successfully',
    type: TBaseDTO<{ messageId: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async forwardEmail(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
    @Body() forwardEmailDto: ForwardEmailDto,
  ): Promise<TBaseDTO<{ messageId: string }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.forwardEmail(
      userId,
      emailId,
      forwardEmailDto.to,
      forwardEmailDto.message,
      forwardEmailDto.cc,
    );

    if (result.success && result.messageId) {
      return new TBaseDTO<{ messageId: string }>({
        messageId: result.messageId,
      });
    } else {
      return new TBaseDTO<{ messageId: string }>(
        undefined,
        undefined,
        result.error || 'Failed to forward email',
      );
    }
  }

  /**
   * Modify email (mark read/unread, star, delete, etc.)
   */
  @Post('emails/:id/modify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modify email (mark read/unread, star, delete)' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Email modified successfully',
    type: TBaseDTO<{ success: boolean }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async modifyEmail(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
    @Body() modifyEmailDto: ModifyEmailDto,
  ): Promise<TBaseDTO<{ success: boolean }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.modifyEmail(userId, emailId, {
      markRead: modifyEmailDto.markRead,
      addLabelIds: modifyEmailDto.addLabelIds,
      removeLabelIds: modifyEmailDto.removeLabelIds,
    });

    if (result.success) {
      return new TBaseDTO<{ success: boolean }>({ success: true });
    } else {
      return new TBaseDTO<{ success: boolean }>(
        undefined,
        undefined,
        result.error || 'Failed to modify email',
      );
    }
  }

  /**
   * Delete email
   */
  @Delete('emails/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete email' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Email deleted successfully',
    type: TBaseDTO<{ success: boolean }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async deleteEmail(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
  ): Promise<TBaseDTO<{ success: boolean }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.deleteEmail(userId, emailId);

    if (result.success) {
      return new TBaseDTO<{ success: boolean }>({ success: true });
    } else {
      return new TBaseDTO<{ success: boolean }>(
        undefined,
        undefined,
        result.error || 'Failed to delete email',
      );
    }
  }

  /**
   * Get attachment
   */
  @Get('attachments/:emailId/:attachmentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get email attachment' })
  @ApiParam({
    name: 'emailId',
    description: 'Email ID',
    type: Number,
    example: 1,
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Attachment ID from Gmail',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Attachment retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async getAttachment(
    @Request() req: any,
    @Param('emailId', GGJParseIntPipe) emailId: number,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const result = await this.gmailService.getAttachment(
      userId,
      emailId,
      attachmentId,
    );

    if (result.success && result.data) {
      res.setHeader(
        'Content-Type',
        result.contentType || 'application/octet-stream',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename || 'attachment'}"`,
      );
      res.send(result.data);
    } else {
      res.status(404).json({
        success: false,
        error: result.error || 'Attachment not found',
      });
    }
  }

  /**
   * Update email status (for Kanban drag-and-drop)
   */
  @Post('emails/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update email status for Kanban board' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Email status updated successfully',
    type: TBaseDTO<{ success: boolean }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async updateEmailStatus(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
    @Body() updateStatusDto: UpdateEmailStatusDto,
  ): Promise<TBaseDTO<{ success: boolean }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.updateEmailStatus(
      userId,
      emailId,
      updateStatusDto.status,
    );

    if (result.success) {
      return new TBaseDTO<{ success: boolean }>({ success: true });
    } else {
      return new TBaseDTO<{ success: boolean }>(
        undefined,
        undefined,
        result.error || 'Failed to update email status',
      );
    }
  }

  /**
   * Snooze an email
   */
  @Post('emails/:id/snooze')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Snooze an email until a specific date' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Email snoozed successfully',
    type: TBaseDTO<{ success: boolean }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async snoozeEmail(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) emailId: number,
    @Body() snoozeEmailDto: SnoozeEmailDto,
  ): Promise<TBaseDTO<{ success: boolean }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.snoozeEmail(
      userId,
      emailId,
      snoozeEmailDto.snoozeUntil,
    );

    if (result.success) {
      return new TBaseDTO<{ success: boolean }>({ success: true });
    } else {
      return new TBaseDTO<{ success: boolean }>(
        undefined,
        undefined,
        result.error || 'Failed to snooze email',
      );
    }
  }

  /**
   * Get emails by Kanban status/column
   */
  @Get('kanban/columns/:status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get emails by Kanban status/column' })
  @ApiParam({
    name: 'status',
    description: 'Kanban status',
    enum: KanbanStatus,
    example: KanbanStatus.INBOX,
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 50, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Emails retrieved successfully',
    type: TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; status: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getEmailsByStatus(
    @Request() req: any,
    @Param('status') status: KanbanStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; status: string }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 50;

    if (pageNum < 1 || limitNum < 1) {
      return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; status: string }>(
        undefined,
        undefined,
        'Page and limit must be positive numbers',
      );
    }

    // Validate status
    if (!Object.values(KanbanStatus).includes(status)) {
      return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; status: string }>(
        undefined,
        undefined,
        'Invalid status. Must be one of: inbox, todo, in_progress, done, snoozed',
      );
    }

    const result = await this.gmailService.getEmailsByStatus(
      userId,
      status,
      pageNum,
      limitNum,
    );

    return new TBaseDTO<{ emails: any[]; total: number; page: number; limit: number; status: string }>(result);
  }

  /**
   * Get full Kanban board with all columns
   */
  @Get('kanban/board')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get full Kanban board with all columns' })
  @ApiResponse({
    status: 200,
    description: 'Kanban board retrieved successfully',
    type: TBaseDTO<{
      columns: Array<{
        id: string;
        name: string;
        emails: any[];
        count: number;
      }>;
    }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getKanbanBoard(
    @Request() req: any,
  ): Promise<TBaseDTO<{
    columns: Array<{
      id: string;
      name: string;
      emails: any[];
      count: number;
    }>;
  }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.getKanbanBoard(userId);
    return new TBaseDTO<{
      columns: Array<{
        id: string;
        name: string;
        emails: any[];
        count: number;
      }>;
    }>(result);
  }

  /**
   * Fuzzy search emails using semantic search (Qdrant)
   * Searches in subject, sender (name + email), and summary with typo tolerance
   */
  @Get('search/fuzzy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fuzzy search emails with typo tolerance using semantic search' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum results (default: 50, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Fuzzy search results retrieved successfully',
    type: TBaseDTO<{
      results: Array<{
        email: any;
        relevanceScore: number;
      }>;
      total: number;
    }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request - query is required' })
  async fuzzySearch(
    @Request() req: any,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<TBaseDTO<{
    results: Array<{
      email: any;
      relevanceScore: number;
    }>;
    total: number;
  }>> {
    if (!query || query.trim().length === 0) {
      return new TBaseDTO<{
        results: Array<{
          email: any;
          relevanceScore: number;
        }>;
        total: number;
      }>(
        undefined,
        undefined,
        'Search query is required',
      );
    }

    const userId = req.user.userId;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 50;

    if (limitNum < 1) {
      return new TBaseDTO<{
        results: Array<{
          email: any;
          relevanceScore: number;
        }>;
        total: number;
      }>(
        undefined,
        undefined,
        'Limit must be a positive number',
      );
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.geminiService.generateEmbedding(query.trim());

      // Search in Qdrant
      const qdrantResults = await this.qdrantService.searchSimilarEmails(
        queryEmbedding,
        userId,
        limitNum * 2, // Get more results to filter and enrich
      );

      // Filter by minimum score and enrich with full email data
      const filteredResults = await Promise.all(
        qdrantResults
          .filter((r) => r.score > 0.3) // Lower threshold for better recall
          .slice(0, limitNum)
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

      return new TBaseDTO<{
        results: Array<{
          email: any;
          relevanceScore: number;
        }>;
        total: number;
      }>({
        results: validResults,
        total: validResults.length,
      });
    } catch (error: any) {
      return new TBaseDTO<{
        results: Array<{
          email: any;
          relevanceScore: number;
        }>;
        total: number;
      }>(
        undefined,
        undefined,
        error.message || 'Search failed',
      );
    }
  }

  /**
   * Get all Kanban columns for current user
   */
  @Get('kanban/columns')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all Kanban columns configuration' })
  @ApiResponse({
    status: 200,
    description: 'Kanban columns retrieved successfully',
    type: TBaseDTO<Array<{
      id: number;
      name: string;
      statusId: string;
      order: number;
      gmailLabel: string | null;
      isActive: boolean;
      isDefault: boolean;
    }>>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getKanbanColumns(@Request() req: any): Promise<TBaseDTO<any[]>> {
    const userId = req.user.userId;
    const columns = await this.gmailService.getKanbanColumns(userId);
    return new TBaseDTO<any[]>(columns);
  }

  /**
   * Create a new Kanban column
   */
  @Post('kanban/columns')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new Kanban column' })
  @ApiResponse({
    status: 200,
    description: 'Column created successfully',
    type: TBaseDTO<any>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createKanbanColumn(
    @Request() req: any,
    @Body() createColumnDto: CreateKanbanColumnDto,
  ): Promise<TBaseDTO<any>> {
    try {
      const userId = req.user.userId;
      const column = await this.gmailService.createKanbanColumn(
        userId,
        createColumnDto.name,
        createColumnDto.statusId,
        createColumnDto.order,
        createColumnDto.gmailLabel,
      );
      return new TBaseDTO<any>(column);
    } catch (error: any) {
      return new TBaseDTO<any>(undefined, undefined, error.message || 'Failed to create column');
    }
  }

  /**
   * Update a Kanban column (rename, reorder, update label mapping)
   */
  @Put('kanban/columns/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a Kanban column' })
  @ApiParam({ name: 'id', description: 'Column ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Column updated successfully',
    type: TBaseDTO<any>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async updateKanbanColumn(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) columnId: number,
    @Body() updateColumnDto: UpdateKanbanColumnDto,
  ): Promise<TBaseDTO<any>> {
    try {
      const userId = req.user.userId;
      const column = await this.gmailService.updateKanbanColumn(userId, columnId, {
        name: updateColumnDto.name,
        order: updateColumnDto.order,
        gmailLabel: updateColumnDto.gmailLabel,
        isActive: updateColumnDto.isActive,
      });
      return new TBaseDTO<any>(column);
    } catch (error: any) {
      return new TBaseDTO<any>(undefined, undefined, error.message || 'Failed to update column');
    }
  }

  /**
   * Delete a Kanban column
   */
  @Delete('kanban/columns/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a Kanban column' })
  @ApiParam({ name: 'id', description: 'Column ID', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Column deleted successfully',
    type: TBaseDTO<{ success: boolean }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async deleteKanbanColumn(
    @Request() req: any,
    @Param('id', GGJParseIntPipe) columnId: number,
  ): Promise<TBaseDTO<{ success: boolean }>> {
    const userId = req.user.userId;
    const result = await this.gmailService.deleteKanbanColumn(userId, columnId);

    if (result.success) {
      return new TBaseDTO<{ success: boolean }>({ success: true });
    } else {
      return new TBaseDTO<{ success: boolean }>(undefined, undefined, result.error || 'Failed to delete column');
    }
  }
}
