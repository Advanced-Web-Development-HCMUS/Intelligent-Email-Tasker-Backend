import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { EmailRaw } from './entities/email-raw.entity';
import { User } from '../auth/entities/user.entity';
import { KafkaService } from '../kafka/kafka.service';

/**
 * Service for Gmail integration
 */
@Injectable()
export class GmailService {
  constructor(
    @InjectRepository(EmailRaw)
    private readonly emailRawRepository: Repository<EmailRaw>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly kafkaService: KafkaService,
  ) {}

  /**
   * Create OAuth2 client for Gmail API
   */
  private createOAuth2Client(accessToken?: string, refreshToken?: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/gmail/oauth/callback',
    );

    if (accessToken) {
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }

    return oauth2Client;
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(userId: number): { url: string; state: string } {
    const oauth2Client = this.createOAuth2Client();
    const state = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state,
      prompt: 'consent', // Force consent screen to get refresh token
    });

    return { url, state };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const oauth2Client = this.createOAuth2Client();

    try {
      const { tokens } = await oauth2Client.getToken(code);

      return {
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date
          ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
          : undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to exchange code for tokens: ${error.message}`);
    }
  }

  /**
   * Fetch emails from Gmail and store in database
   */
  async fetchAndStoreEmails(
    userId: number,
    accessToken: string,
    refreshToken?: string,
    maxResults: number = 50,
  ): Promise<{ success: boolean; count: number; message: string }> {
    try {
      // Get user
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return { success: false, count: 0, message: 'User not found' };
      }

      // Validate access token
      if (!accessToken) {
        return { success: false, count: 0, message: 'Access token is required' };
      }

      // Create OAuth2 client
      const oauth2Client = this.createOAuth2Client(accessToken, refreshToken);

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Fetch messages
      let response;
      try {
        response = await gmail.users.messages.list({
          userId: 'me',
          maxResults,
          q: 'in:inbox', // Only fetch inbox emails
        });
      } catch (error: any) {
        console.error('Gmail API list error:', error);
        if (error.code === 401 || error.response?.status === 401) {
          return {
            success: false,
            count: 0,
            message: 'Invalid or expired access token. Please re-authenticate.',
          };
        }
        if (error.code === 403 || error.response?.status === 403) {
          return {
            success: false,
            count: 0,
            message: 'Gmail API access denied. Please grant Gmail permissions.',
          };
        }
        throw error;
      }

      const messages = response.data.messages || [];
      let storedCount = 0;
      let skippedCount = 0;
      const storedEmailIds: number[] = [];

      // Process each message
      for (const message of messages) {
        if (!message.id) continue;

        // Check if email already exists
        const existing = await this.emailRawRepository.findOne({
          where: { gmailId: message.id, userId },
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        try {
          // Get full message details
          let messageDetail;
          try {
            messageDetail = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full',
            });
          } catch (error: any) {
            console.error(`Error fetching message ${message.id}:`, error.message);
            // Skip this message and continue
            continue;
          }

          const msg = messageDetail.data;
          const payload = msg.payload;

          if (!payload) {
            console.warn(`Message ${message.id} has no payload, skipping`);
            continue;
          }

          // Extract headers
          const headers = payload.headers || [];
          const getHeader = (name: string): string => {
            const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
            return header?.value || '';
          };

          // Extract email addresses
          const from = getHeader('From');
          const fromMatch = from.match(/(.*?)\s*<(.+?)>|(.+)/);
          const fromName = fromMatch ? (fromMatch[1] || fromMatch[3] || '').trim() : '';
          const fromEmail = fromMatch ? (fromMatch[2] || fromMatch[3] || '').trim() : from;

          const to = getHeader('To') || '';
          const cc = getHeader('Cc') || '';
          const bcc = getHeader('Bcc') || '';

          // Extract body
          let bodyText = '';
          let bodyHtml = '';

          const extractBody = (part: any): void => {
            if (part.body?.data) {
              const data = Buffer.from(part.body.data, 'base64').toString('utf-8');
              const mimeType = part.mimeType || '';

              if (mimeType === 'text/plain') {
                bodyText = data;
              } else if (mimeType === 'text/html') {
                bodyHtml = data;
              }
            }

            if (part.parts) {
              part.parts.forEach((p: any) => extractBody(p));
            }
          };

          extractBody(payload);

          // If no body found, try to get from parts
          if (!bodyText && !bodyHtml && payload.parts) {
            payload.parts.forEach((part: any) => extractBody(part));
          }

          // Get dates
          let internalDate: Date | null = null;
          if (msg.internalDate) {
            try {
              internalDate = new Date(parseInt(msg.internalDate));
              if (isNaN(internalDate.getTime())) {
                internalDate = null;
              }
            } catch (e) {
              internalDate = null;
            }
          }

          let sentAt: Date | null = internalDate;
          const dateHeader = getHeader('Date');
          if (dateHeader) {
            try {
              const parsedDate = new Date(dateHeader);
              if (!isNaN(parsedDate.getTime())) {
                sentAt = parsedDate;
              }
            } catch (e) {
              // Use internalDate if date header parsing fails
            }
          }

          // Get labels
          const labels = msg.labelIds || [];

          // Create email raw record
          try {
            const emailRaw = this.emailRawRepository.create({
              userId,
              gmailId: message.id,
              threadId: msg.threadId || null,
              from: fromEmail || '',
              fromName: fromName || fromEmail || '',
              to: to ? JSON.stringify(to.split(',').map((e: string) => e.trim())) : null,
              cc: cc ? JSON.stringify(cc.split(',').map((e: string) => e.trim())) : null,
              bcc: bcc ? JSON.stringify(bcc.split(',').map((e: string) => e.trim())) : null,
              subject: getHeader('Subject') || '',
              snippet: msg.snippet || '',
              bodyText: bodyText || '',
              bodyHtml: bodyHtml || '',
              isRead: !labels.includes('UNREAD'),
              isStarred: labels.includes('STARRED'),
              isImportant: labels.includes('IMPORTANT'),
              labels: labels.length > 0 ? JSON.stringify(labels) : null,
              receivedAt: internalDate,
              sentAt: sentAt,
              rawData: JSON.stringify(msg),
            });

            const savedEmail = await this.emailRawRepository.save(emailRaw);
            storedCount++;
            storedEmailIds.push(savedEmail.id);
          } catch (dbError: any) {
            console.error(`Error saving email ${message.id} to database:`, dbError.message);
            // Continue with next message
          }
        } catch (error: any) {
          console.error(`Error processing message ${message.id}:`, error.message);
          // Continue with next message
        }
      }

      // Publish event to Kafka for AI processing
      if (storedCount > 0 && storedEmailIds.length > 0) {
        try {
          await this.kafkaService.publishEmailFetchedEvent(userId, storedEmailIds);
        } catch (kafkaError: any) {
          console.error('Failed to publish Kafka event:', kafkaError);
          // Don't fail the whole operation if Kafka fails
        }
      }

      return {
        success: true,
        count: storedCount,
        message: `Successfully stored ${storedCount} emails. ${skippedCount} emails already existed.`,
      };
    } catch (error: any) {
      console.error('Gmail fetch error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });

      // Provide more specific error messages
      if (error.code === 401 || error.response?.status === 401) {
        return {
          success: false,
          count: 0,
          message: 'Invalid or expired access token. Please re-authenticate with Google.',
        };
      }
      if (error.code === 403 || error.response?.status === 403) {
        return {
          success: false,
          count: 0,
          message: 'Gmail API access denied. Please grant Gmail.readonly permission.',
        };
      }
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          count: 0,
          message: 'Network error. Cannot connect to Gmail API.',
        };
      }

      return {
        success: false,
        count: 0,
        message: `Failed to fetch emails: ${error.message || error.code || 'Unknown error'}`,
      };
    }
  }

  /**
   * Get stored emails for a user
   */
  async getStoredEmails(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ emails: EmailRaw[]; total: number; page: number; limit: number }> {
    const [emails, total] = await this.emailRawRepository.findAndCount({
      where: { userId },
      order: { receivedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      emails,
      total,
      page,
      limit,
    };
  }
}

