import { ApiProperty } from '@nestjs/swagger';

/**
 * Mailbox response DTO
 */
export class MailboxDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Inbox' })
  name: string;

  @ApiProperty({ example: 5 })
  unreadCount: number;

  @ApiProperty({ example: 'inbox' })
  type: string;
}

