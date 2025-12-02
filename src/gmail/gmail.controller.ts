import {
  Controller,
  Post,
  Get,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FetchEmailsDto } from './dto/fetch-emails.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
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
    const result = await this.gmailService.fetchAndStoreEmails(userId, 50);

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
}
