import { Injectable } from '@nestjs/common';
import { Mailbox } from './entities/mailbox.entity';
import { Email } from './entities/email.entity';

/**
 * Mock email data generator
 */
@Injectable()
export class EmailService {
  /**
   * Generate mock mailboxes
   */
  getMailboxes(): Mailbox[] {
    return [
      { id: 1, name: 'Inbox', unreadCount: 5, type: 'inbox' },
      { id: 2, name: 'Starred', unreadCount: 2, type: 'starred' },
      { id: 3, name: 'Sent', unreadCount: 0, type: 'sent' },
      { id: 4, name: 'Drafts', unreadCount: 1, type: 'drafts' },
      { id: 5, name: 'Archive', unreadCount: 0, type: 'archive' },
      { id: 6, name: 'Trash', unreadCount: 0, type: 'trash' },
      { id: 7, name: 'Work', unreadCount: 3, type: 'custom' },
      { id: 8, name: 'Personal', unreadCount: 1, type: 'custom' },
    ];
  }

  /**
   * Generate mock emails for a mailbox
   */
  getEmailsByMailbox(mailboxId: number, page: number = 1, limit: number = 20): {
    emails: Email[];
    total: number;
    page: number;
    limit: number;
  } {
    const allEmails = this.generateMockEmails(mailboxId);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEmails = allEmails.slice(startIndex, endIndex);

    return {
      emails: paginatedEmails,
      total: allEmails.length,
      page,
      limit,
    };
  }

  /**
   * Get email by ID
   */
  getEmailById(emailId: number): Email | null {
    // Search across all mailboxes
    for (let mailboxId = 1; mailboxId <= 8; mailboxId++) {
      const emails = this.generateMockEmails(mailboxId);
      const email = emails.find((e) => e.id === emailId);
      if (email) {
        return email;
      }
    }
    return null;
  }

  /**
   * Generate mock emails based on mailbox type
   */
  private generateMockEmails(mailboxId: number): Email[] {
    const mockEmails: Email[] = [];
    const senders = [
      { name: 'Alice Johnson', email: 'alice@example.com' },
      { name: 'Bob Smith', email: 'bob@example.com' },
      { name: 'Charlie Brown', email: 'charlie@example.com' },
      { name: 'Diana Prince', email: 'diana@example.com' },
      { name: 'Eve Wilson', email: 'eve@example.com' },
      { name: 'Frank Miller', email: 'frank@example.com' },
      { name: 'Grace Lee', email: 'grace@example.com' },
      { name: 'Henry Davis', email: 'henry@example.com' },
    ];

    const subjects = [
      'Project Update: Q4 Review',
      'Meeting Scheduled for Tomorrow',
      'Important: Action Required',
      'Weekly Newsletter',
      'Invoice #12345',
      'Re: Your Recent Inquiry',
      'Welcome to Our Service',
      'Security Alert',
      'New Feature Announcement',
      'Team Building Event',
    ];

    const previews = [
      'Hi there, I wanted to update you on the progress...',
      'This is a reminder about our upcoming meeting...',
      'Please review the attached document and provide feedback...',
      'Check out our latest updates and improvements...',
      'Your invoice is ready for review...',
      'Thank you for reaching out. Here is our response...',
      'We are excited to have you on board...',
      'We detected a new login from an unfamiliar device...',
      'We are thrilled to announce our new feature...',
      'Join us for a fun team building activity...',
    ];

    const bodies = [
      '<p>Hi there,</p><p>I wanted to update you on the progress of our project. We have made significant strides in the past week and are on track to meet our deadlines.</p><p>Best regards,<br/>Team</p>',
      '<p>Hello,</p><p>This is a reminder about our upcoming meeting scheduled for tomorrow at 2 PM. Please confirm your attendance.</p><p>Thank you,<br/>Organizer</p>',
      '<p>Dear User,</p><p>Please review the attached document and provide your feedback by the end of the week. Your input is valuable to us.</p><p>Regards,<br/>Management</p>',
      '<p>Hello,</p><p>Check out our latest updates and improvements. We have been working hard to enhance your experience.</p><p>Stay tuned for more updates!</p>',
      '<p>Dear Customer,</p><p>Your invoice #12345 is ready for review. Please make payment by the due date.</p><p>Thank you for your business.</p>',
      '<p>Hi,</p><p>Thank you for reaching out. Here is our response to your inquiry. If you have any further questions, please don\'t hesitate to ask.</p><p>Best regards,<br/>Support Team</p>',
      '<p>Welcome!</p><p>We are excited to have you on board. Get started by exploring our features and resources.</p><p>Happy exploring!</p>',
      '<p>Security Alert</p><p>We detected a new login from an unfamiliar device. If this was you, no action is needed. If not, please secure your account immediately.</p><p>Security Team</p>',
      '<p>Announcement</p><p>We are thrilled to announce our new feature that will make your life easier. Check it out now!</p><p>Product Team</p>',
      '<p>Hello Team,</p><p>Join us for a fun team building activity this Friday. We look forward to seeing everyone there!</p><p>HR Team</p>',
    ];

    // Generate different number of emails based on mailbox
    const emailCount = mailboxId === 1 ? 25 : mailboxId === 2 ? 10 : mailboxId === 3 ? 15 : mailboxId === 4 ? 5 : mailboxId === 7 ? 12 : mailboxId === 8 ? 8 : 3;

    for (let i = 0; i < emailCount; i++) {
      const sender = senders[Math.floor(Math.random() * senders.length)];
      const subjectIndex = Math.floor(Math.random() * subjects.length);
      const isRead = Math.random() > 0.3; // 70% read
      const isStarred = Math.random() > 0.7; // 30% starred
      const hasAttachments = Math.random() > 0.6; // 40% have attachments

      const email: Email = {
        id: mailboxId * 1000 + i + 1,
        from: sender,
        to: [{ name: 'You', email: 'user@example.com' }],
        cc: Math.random() > 0.7 ? [{ name: 'CC User', email: 'cc@example.com' }] : undefined,
        subject: subjects[subjectIndex],
        preview: previews[subjectIndex],
        body: bodies[subjectIndex],
        isHtml: true,
        isRead,
        isStarred,
        receivedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
        attachments: hasAttachments
          ? [
              {
                id: `att-${i}`,
                filename: `document-${i + 1}.pdf`,
                size: Math.floor(Math.random() * 5000000) + 100000, // 100KB to 5MB
                mimeType: 'application/pdf',
              },
            ]
          : undefined,
      };

      mockEmails.push(email);
    }

    // Sort by received date (newest first)
    mockEmails.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    return mockEmails;
  }
}

