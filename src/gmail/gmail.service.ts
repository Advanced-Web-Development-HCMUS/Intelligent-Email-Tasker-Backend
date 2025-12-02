import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { EmailRaw } from './entities/email-raw.entity';
import { GmailToken } from './entities/gmail-token.entity';
import { User } from '../auth/entities/user.entity';
import { KafkaService } from '../kafka/kafka.service';

/**
 * Service for Gmail integration
 */
@Injectable()
export class GmailService {
  private refreshLocks = new Map<number, Promise<string>>(); // Concurrency guard for token refresh

  constructor(
    @InjectRepository(EmailRaw)
    private readonly emailRawRepository: Repository<EmailRaw>,
    @InjectRepository(GmailToken)
    private readonly gmailTokenRepository: Repository<GmailToken>,
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
      process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:3000/auth/google/callback',
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
   * Check if user has Gmail connected
   */
  async checkGmailConnection(
    userId: number,
  ): Promise<{ connected: boolean; email?: string }> {
    const token = await this.gmailTokenRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!token) {
      return { connected: false };
    }

    return {
      connected: true,
      email: token.user?.email,
    };
  }

  /**
   * Save Gmail OAuth tokens (for OAuth callback)
   */
  async saveGmailTokens(
    userId: number,
    accessToken: string,
    refreshToken: string | null | undefined,
    expiryDate: number | null | undefined,
    email?: string | null,
  ): Promise<void> {
    let token = await this.gmailTokenRepository.findOne({
      where: { userId },
    });

    const accessTokenExpiry = expiryDate ? new Date(expiryDate) : null;

    if (token) {
      token.accessToken = accessToken;
      if (refreshToken) {
        token.refreshToken = refreshToken;
      }
      token.accessTokenExpiry = accessTokenExpiry;
    } else {
      token = this.gmailTokenRepository.create({
        userId,
        accessToken,
        refreshToken: refreshToken || '',
        accessTokenExpiry,
      });
    }

    await this.gmailTokenRepository.save(token);
  }

  /**
   * Delete Gmail tokens (disconnect)
   */
  async deleteGmailTokens(userId: number): Promise<void> {
    await this.gmailTokenRepository.delete({ userId });
  }

  /**
   * Save or update Gmail OAuth tokens for a user
   */
  async saveGmailToken(
    userId: number,
    refreshToken: string,
    accessToken?: string,
    expiresIn?: number,
  ): Promise<GmailToken> {
    let token = await this.gmailTokenRepository.findOne({
      where: { userId },
    });

    const accessTokenExpiry =
      accessToken && expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    if (token) {
      token.refreshToken = refreshToken;
      if (accessToken) {
        token.accessToken = accessToken;
        token.accessTokenExpiry = accessTokenExpiry;
      }
    } else {
      token = this.gmailTokenRepository.create({
        userId,
        refreshToken,
        accessToken: accessToken || null,
        accessTokenExpiry,
      });
    }

    return await this.gmailTokenRepository.save(token);
  }

  /**
   * Get valid access token for user (refresh if needed)
   */
  async getValidAccessToken(userId: number): Promise<string> {
    const token = await this.gmailTokenRepository.findOne({
      where: { userId },
    });

    if (!token) {
      throw new Error(
        'Gmail token not found. Please re-authenticate with Google.',
      );
    }

    // Check if access token is still valid (with 5 minute buffer)
    if (
      token.accessToken &&
      token.accessTokenExpiry &&
      token.accessTokenExpiry.getTime() > Date.now() + 5 * 60 * 1000
    ) {
      return token.accessToken;
    }

    // Refresh token if already in progress, wait for it
    if (this.refreshLocks.has(userId)) {
      return await this.refreshLocks.get(userId)!;
    }

    // Start refresh
    const refreshPromise = this.refreshAccessToken(userId, token.refreshToken);
    this.refreshLocks.set(userId, refreshPromise);

    try {
      const newAccessToken = await refreshPromise;
      return newAccessToken;
    } finally {
      this.refreshLocks.delete(userId);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(
    userId: number,
    refreshToken: string,
  ): Promise<string> {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const newAccessToken = credentials.access_token || '';
      const expiresIn = credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : undefined;

      // Update stored token
      await this.saveGmailToken(
        userId,
        refreshToken,
        newAccessToken,
        expiresIn,
      );

      return newAccessToken;
    } catch (error: any) {
      // If refresh fails, delete token and force re-auth
      await this.gmailTokenRepository.delete({ userId });
      throw new Error(
        `Failed to refresh access token: ${error.message}. Please re-authenticate.`,
      );
    }
  }

  /**
   * Get Gmail API client with valid token
   */
  private async getGmailClient(userId: number) {
    const accessToken = await this.getValidAccessToken(userId);
    const oauth2Client = this.createOAuth2Client(accessToken);
    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Fetch emails from Gmail and store in database
   */
  async fetchAndStoreEmails(
    userId: number,
    maxResults: number = 50,
  ): Promise<{ success: boolean; count: number; message: string }> {
    try {
      // Get user
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return { success: false, count: 0, message: 'User not found' };
      }

      // Use stored token with auto-refresh
      const gmail = await this.getGmailClient(userId);

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
            console.error(
              `Error fetching message ${message.id}:`,
              error.message,
            );
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
            const header = headers.find(
              (h) => h.name?.toLowerCase() === name.toLowerCase(),
            );
            return header?.value || '';
          };

          // Extract email addresses
          const from = getHeader('From');
          const fromMatch = from.match(/(.*?)\s*<(.+?)>|(.+)/);
          const fromName = fromMatch
            ? (fromMatch[1] || fromMatch[3] || '').trim()
            : '';
          const fromEmail = fromMatch
            ? (fromMatch[2] || fromMatch[3] || '').trim()
            : from;

          const to = getHeader('To') || '';
          const cc = getHeader('Cc') || '';
          const bcc = getHeader('Bcc') || '';

          // Extract body
          let bodyText = '';
          let bodyHtml = '';

          const extractBody = (part: any): void => {
            if (part.body?.data) {
              const data = Buffer.from(part.body.data, 'base64').toString(
                'utf-8',
              );
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
              to: to
                ? JSON.stringify(to.split(',').map((e: string) => e.trim()))
                : null,
              cc: cc
                ? JSON.stringify(cc.split(',').map((e: string) => e.trim()))
                : null,
              bcc: bcc
                ? JSON.stringify(bcc.split(',').map((e: string) => e.trim()))
                : null,
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
            console.error(
              `Error saving email ${message.id} to database:`,
              dbError.message,
            );
            // Continue with next message
          }
        } catch (error: any) {
          console.error(
            `Error processing message ${message.id}:`,
            error.message,
          );
          // Continue with next message
        }
      }

      // Publish event to Kafka for AI processing
      if (storedCount > 0 && storedEmailIds.length > 0) {
        try {
          await this.kafkaService.publishEmailFetchedEvent(
            userId,
            storedEmailIds,
          );
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
          message:
            'Invalid or expired access token. Please re-authenticate with Google.',
        };
      }
      if (error.code === 403 || error.response?.status === 403) {
        return {
          success: false,
          count: 0,
          message:
            'Gmail API access denied. Please grant Gmail.readonly permission.',
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
   * Get list of mailboxes (Inbox, Sent, etc.) based on labels
   */
  async getMailboxes(userId: number): Promise<{
    mailboxes: Array<{
      id: string;
      name: string;
      count: number;
      unreadCount: number;
    }>;
  }> {
    const MAX_MAILBOXES = 50;
    const commonMailboxes = [
      { id: 'INBOX', name: 'Inbox' },
      { id: 'SENT', name: 'Sent' },
      { id: 'DRAFT', name: 'Drafts' },
      { id: 'SPAM', name: 'Spam' },
      { id: 'TRASH', name: 'Trash' },
      { id: 'IMPORTANT', name: 'Important' },
      { id: 'STARRED', name: 'Starred' },
    ];

    const mailboxes: Array<{
      id: string;
      name: string;
      count: number;
      unreadCount: number;
    }> = [];

    // Get counts for common mailboxes
    for (const mailbox of commonMailboxes) {
      let count = 0;
      let unreadCount = 0;

      if (mailbox.id === 'STARRED') {
        count = await this.emailRawRepository.count({
          where: {
            userId,
            isStarred: true,
          },
        });
        unreadCount = await this.emailRawRepository.count({
          where: {
            userId,
            isStarred: true,
            isRead: false,
          },
        });
      } else if (mailbox.id === 'IMPORTANT') {
        count = await this.emailRawRepository.count({
          where: {
            userId,
            isImportant: true,
          },
        });
        unreadCount = await this.emailRawRepository.count({
          where: {
            userId,
            isImportant: true,
            isRead: false,
          },
        });
      } else {
        count = await this.emailRawRepository
          .createQueryBuilder('email')
          .where('email.userId = :userId', { userId })
          .andWhere('email.labels LIKE :label', { label: `%${mailbox.id}%` })
          .getCount();

        unreadCount = await this.emailRawRepository
          .createQueryBuilder('email')
          .where('email.userId = :userId', { userId })
          .andWhere('email.labels LIKE :label', { label: `%${mailbox.id}%` })
          .andWhere('email.isRead = :isRead', { isRead: false })
          .getCount();
      }

      mailboxes.push({
        id: mailbox.id,
        name: mailbox.name,
        count,
        unreadCount,
      });
    }

    // Get other custom labels from emails
    const emailsWithLabels = await this.emailRawRepository
      .createQueryBuilder('email')
      .select('email.labels', 'labels')
      .where('email.userId = :userId', { userId })
      .andWhere('email.labels IS NOT NULL')
      .limit(MAX_MAILBOXES)
      .getRawMany();

    const customLabels = new Set<string>();
    emailsWithLabels.forEach((email) => {
      try {
        const labels = JSON.parse(email.labels);
        if (Array.isArray(labels)) {
          labels.forEach((label: string) => {
            // Skip common mailboxes and system labels
            if (
              !commonMailboxes.some((m) => m.id === label) &&
              !label.startsWith('CATEGORY_') &&
              !label.startsWith('UNREAD')
            ) {
              customLabels.add(label);
            }
          });
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });

    // Add custom labels with counts
    for (const label of Array.from(customLabels).slice(0, 20)) {
      const count = await this.emailRawRepository
        .createQueryBuilder('email')
        .where('email.userId = :userId', { userId })
        .andWhere('email.labels LIKE :label', { label: `%${label}%` })
        .getCount();

      const unreadCount = await this.emailRawRepository
        .createQueryBuilder('email')
        .where('email.userId = :userId', { userId })
        .andWhere('email.labels LIKE :label', { label: `%${label}%` })
        .andWhere('email.isRead = :isRead', { isRead: false })
        .getCount();

      mailboxes.push({
        id: label,
        name: label.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        count,
        unreadCount,
      });
    }

    return { mailboxes };
  }

  /**
   * Get emails in a specific mailbox with pagination and filtering
   */
  async getEmailsByMailbox(
    userId: number,
    mailboxId: string,
    page: number = 1,
    limit: number = 20,
    filters: { isRead?: boolean; isStarred?: boolean } = {},
  ): Promise<{
    emails: any[];
    total: number;
    page: number;
    limit: number;
    mailbox: string;
  }> {
    const skip = (page - 1) * limit;

    // Build query
    const queryBuilder = this.emailRawRepository
      .createQueryBuilder('email')
      .where('email.userId = :userId', { userId });

    // Filter by mailbox (label)
    if (mailboxId === 'STARRED') {
      queryBuilder.andWhere('email.isStarred = :isStarred', {
        isStarred: true,
      });
    } else if (mailboxId === 'IMPORTANT') {
      queryBuilder.andWhere('email.isImportant = :isImportant', {
        isImportant: true,
      });
    } else {
      queryBuilder.andWhere('email.labels LIKE :label', {
        label: `%${mailboxId}%`,
      });
    }

    // Apply additional filters
    if (filters.isRead !== undefined) {
      queryBuilder.andWhere('email.isRead = :isRead', {
        isRead: filters.isRead,
      });
    }
    if (filters.isStarred !== undefined) {
      queryBuilder.andWhere('email.isStarred = :isStarred', {
        isStarred: filters.isStarred,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get emails with pagination
    const emails = await queryBuilder
      .orderBy('email.receivedAt', 'DESC')
      .addOrderBy('email.sentAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    // Format emails for response
    const formattedEmails = emails.map((email) => ({
      id: email.id,
      gmailId: email.gmailId,
      threadId: email.threadId,
      from: {
        name: email.fromName || email.from || 'Unknown',
        email: email.from || ''
      },
      subject: email.subject || '(No Subject)',
      preview: email.snippet || '',
      isRead: email.isRead,
      isStarred: email.isStarred,
      isImportant: email.isImportant,
      labels: email.labels ? JSON.parse(email.labels) : [],
      receivedAt: email.receivedAt,
      sentAt: email.sentAt,
      createdAt: email.createdAt,
    }));

    return {
      emails: formattedEmails,
      total,
      page,
      limit,
      mailbox: mailboxId,
    };
  }

  /**
   * Get email detail by ID
   */
  async getEmailDetail(userId: number, emailId: number): Promise<any | null> {
    const email = await this.emailRawRepository.findOne({
      where: {
        id: emailId,
        userId,
      },
    });

    if (!email) {
      return null;
    }

    // Helper function to parse email addresses
    const parseEmailAddresses = (emailString: string | null): Array<{ name: string; email: string }> => {
      if (!emailString) return [];
      
      try {
        const parsed = JSON.parse(emailString);
        if (Array.isArray(parsed)) {
          return parsed.map((addr: string) => {
            const match = addr.match(/(.*?)\s*<(.+?)>|(.+)/);
            if (match) {
              const name = (match[1] || match[3] || '').trim();
              const email = (match[2] || match[3] || '').trim();
              return { name: name || email, email };
            }
            return { name: addr.trim(), email: addr.trim() };
          });
        }
      } catch (e) {
        // If parsing fails, treat as single email
      }
      
      // Single email string
      const match = emailString.match(/(.*?)\s*<(.+?)>|(.+)/);
      if (match) {
        const name = (match[1] || match[3] || '').trim();
        const email = (match[2] || match[3] || '').trim();
        return [{ name: name || email, email }];
      }
      
      return [{ name: emailString, email: emailString }];
    };

    // Parse JSON fields and format for frontend
    return {
      id: email.id,
      gmailId: email.gmailId,
      threadId: email.threadId,
      from: {
        name: email.fromName || email.from || 'Unknown',
        email: email.from || ''
      },
      to: parseEmailAddresses(email.to),
      cc: parseEmailAddresses(email.cc),
      bcc: parseEmailAddresses(email.bcc),
      subject: email.subject || '(No Subject)',
      body: email.bodyHtml || email.bodyText || '',
      isHtml: !!email.bodyHtml,
      snippet: email.snippet,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
      isRead: email.isRead,
      isStarred: email.isStarred,
      isImportant: email.isImportant,
      labels: email.labels ? JSON.parse(email.labels) : [],
      receivedAt: email.receivedAt,
      sentAt: email.sentAt,
      attachments: [], // TODO: Extract attachments from rawData if needed
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
    };
  }

  /**
   * Get stored emails for a user
   */
  async getStoredEmails(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    emails: EmailRaw[];
    total: number;
    page: number;
    limit: number;
  }> {
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

  /**
   * Send email via Gmail API
   */
  async sendEmail(
    userId: number,
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    attachments?: Array<{
      filename: string;
      content: string;
      contentType: string;
    }>,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const gmail = await this.getGmailClient(userId);

      // Build email message
      const messageParts: string[] = [];
      messageParts.push(`To: ${to.join(', ')}`);
      if (cc && cc.length > 0) {
        messageParts.push(`Cc: ${cc.join(', ')}`);
      }
      if (bcc && bcc.length > 0) {
        messageParts.push(`Bcc: ${bcc.join(', ')}`);
      }
      messageParts.push(`Subject: ${subject}`);
      messageParts.push('Content-Type: text/html; charset=utf-8');
      messageParts.push('');
      messageParts.push(body);

      const rawMessage = messageParts.join('\r\n');

      // Encode message
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return {
        success: true,
        messageId: response.data.id || undefined,
      };
    } catch (error: any) {
      console.error('Send email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Reply to an email
   */
  async replyToEmail(
    userId: number,
    emailId: number,
    replyBody: string,
    attachments?: Array<{
      filename: string;
      content: string;
      contentType: string;
    }>,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Get original email from database
      const originalEmail = await this.emailRawRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!originalEmail) {
        return { success: false, error: 'Email not found' };
      }

      // Get original message from Gmail to get headers
      const gmail = await this.getGmailClient(userId);
      const originalMessage = await gmail.users.messages.get({
        userId: 'me',
        id: originalEmail.gmailId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Message-ID'],
      });

      const headers = originalMessage.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name === name)?.value || '';

      const fromEmail = getHeader('From');
      const toEmail = getHeader('To') || fromEmail;
      const subject = getHeader('Subject');
      const messageId = getHeader('Message-ID');

      // Build reply message
      const messageParts: string[] = [];
      messageParts.push(`To: ${fromEmail}`);
      messageParts.push(`Subject: Re: ${subject.replace(/^Re:\s*/i, '')}`);
      if (messageId) {
        messageParts.push(`In-Reply-To: ${messageId}`);
        messageParts.push(`References: ${messageId}`);
      }
      messageParts.push('Content-Type: text/html; charset=utf-8');
      messageParts.push('');
      messageParts.push(replyBody);

      const rawMessage = messageParts.join('\r\n');

      // Encode message
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: originalEmail.threadId || undefined,
        },
      });

      return {
        success: true,
        messageId: response.data.id || undefined,
      };
    } catch (error: any) {
      console.error('Reply email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to reply to email',
      };
    }
  }

  /**
   * Modify email (mark read/unread, star, delete)
   */
  async modifyEmail(
    userId: number,
    emailId: number,
    actions: {
      markRead?: boolean;
      addLabelIds?: string[];
      removeLabelIds?: string[];
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const email = await this.emailRawRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        return { success: false, error: 'Email not found' };
      }

      const gmail = await this.getGmailClient(userId);

      const addLabelIds: string[] = [];
      const removeLabelIds: string[] = [];

      if (actions.markRead !== undefined) {
        if (actions.markRead) {
          removeLabelIds.push('UNREAD');
        } else {
          addLabelIds.push('UNREAD');
        }
      }

      if (actions.addLabelIds) {
        addLabelIds.push(...actions.addLabelIds);
      }
      if (actions.removeLabelIds) {
        removeLabelIds.push(...actions.removeLabelIds);
      }

      await gmail.users.messages.modify({
        userId: 'me',
        id: email.gmailId,
        requestBody: {
          addLabelIds: addLabelIds.length > 0 ? addLabelIds : undefined,
          removeLabelIds:
            removeLabelIds.length > 0 ? removeLabelIds : undefined,
        },
      });

      // Update local database
      if (actions.markRead !== undefined) {
        email.isRead = actions.markRead;
        await this.emailRawRepository.save(email);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Modify email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to modify email',
      };
    }
  }

  /**
   * Delete email
   */
  async deleteEmail(
    userId: number,
    emailId: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const email = await this.emailRawRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        return { success: false, error: 'Email not found' };
      }

      const gmail = await this.getGmailClient(userId);

      await gmail.users.messages.delete({
        userId: 'me',
        id: email.gmailId,
      });

      // Delete from local database
      await this.emailRawRepository.delete({ id: emailId });

      return { success: true };
    } catch (error: any) {
      console.error('Delete email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete email',
      };
    }
  }

  /**
   * Get attachment by email ID and attachment ID
   */
  async getAttachment(
    userId: number,
    emailId: number,
    attachmentId: string,
  ): Promise<{
    success: boolean;
    data?: Buffer;
    filename?: string;
    contentType?: string;
    error?: string;
  }> {
    try {
      const email = await this.emailRawRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        return { success: false, error: 'Email not found' };
      }

      const gmail = await this.getGmailClient(userId);

      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: email.gmailId,
        id: attachmentId,
      });

      const attachmentData = response.data.data;
      if (!attachmentData) {
        return { success: false, error: 'Attachment data not found' };
      }

      // Decode base64url
      const buffer = Buffer.from(
        attachmentData.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );

      // Try to get filename from email raw data
      let filename = 'attachment';
      let contentType = 'application/octet-stream';

      try {
        if (email.rawData) {
          const rawData = JSON.parse(email.rawData);
          const findAttachment = (parts: any[]): any => {
            for (const part of parts) {
              if (part.body?.attachmentId === attachmentId) {
                return part;
              }
              if (part.parts) {
                const found = findAttachment(part.parts);
                if (found) return found;
              }
            }
            return null;
          };

          const attachment = findAttachment(
            rawData.payload?.parts || [rawData.payload] || [],
          );
          if (attachment) {
            filename = attachment.filename || filename;
            contentType = attachment.mimeType || contentType;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }

      return {
        success: true,
        data: buffer,
        filename,
        contentType,
      };
    } catch (error: any) {
      console.error('Get attachment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get attachment',
      };
    }
  }
}
