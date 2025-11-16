import { ApiProperty } from '@nestjs/swagger';

/**
 * Email sender/recipient DTO
 */
export class EmailAddressDto {
  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;
}

/**
 * Email attachment DTO
 */
export class EmailAttachmentDto {
  @ApiProperty({ example: 'att-1' })
  id: string;

  @ApiProperty({ example: 'document.pdf' })
  filename: string;

  @ApiProperty({ example: 1024000 })
  size: number;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;
}

/**
 * Email list item DTO (for list view)
 */
export class EmailListItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: EmailAddressDto })
  from: EmailAddressDto;

  @ApiProperty({ example: 'Project Update' })
  subject: string;

  @ApiProperty({ example: 'Hi there, I wanted to update you...' })
  preview: string;

  @ApiProperty({ example: true })
  isRead: boolean;

  @ApiProperty({ example: false })
  isStarred: boolean;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  receivedAt: Date;
}

/**
 * Email detail DTO (for detail view)
 */
export class EmailDetailDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: EmailAddressDto })
  from: EmailAddressDto;

  @ApiProperty({ type: [EmailAddressDto] })
  to: EmailAddressDto[];

  @ApiProperty({ type: [EmailAddressDto], required: false })
  cc?: EmailAddressDto[];

  @ApiProperty({ example: 'Project Update' })
  subject: string;

  @ApiProperty({ example: '<p>Email body content...</p>' })
  body: string;

  @ApiProperty({ example: true })
  isHtml: boolean;

  @ApiProperty({ example: true })
  isRead: boolean;

  @ApiProperty({ example: false })
  isStarred: boolean;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  receivedAt: Date;

  @ApiProperty({ type: [EmailAttachmentDto], required: false })
  attachments?: EmailAttachmentDto[];
}

/**
 * Paginated email list response
 */
export class EmailListResponseDto {
  @ApiProperty({ type: [EmailListItemDto] })
  emails: EmailListItemDto[];

  @ApiProperty({ example: 25 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

