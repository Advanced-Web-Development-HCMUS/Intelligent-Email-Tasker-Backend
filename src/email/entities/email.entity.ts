/**
 * Email attachment entity
 */
export class EmailAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
}

/**
 * Email entity
 */
export class Email {
  id: number;
  from: {
    name: string;
    email: string;
  };
  to: Array<{
    name: string;
    email: string;
  }>;
  cc?: Array<{
    name: string;
    email: string;
  }>;
  subject: string;
  preview: string;
  body: string;
  isHtml: boolean;
  isRead: boolean;
  isStarred: boolean;
  receivedAt: Date;
  attachments?: EmailAttachment[];
}

