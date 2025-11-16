/**
 * Mailbox entity
 */
export class Mailbox {
  id: number;
  name: string;
  unreadCount: number;
  type: 'inbox' | 'sent' | 'drafts' | 'starred' | 'archive' | 'trash' | 'custom';
}

