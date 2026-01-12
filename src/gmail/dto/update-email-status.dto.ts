import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Common Kanban status values (for reference)
 * Custom columns can use any string as statusId
 */
export enum KanbanStatus {
  INBOX = 'inbox',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  SNOOZED = 'snoozed',
}

/**
 * DTO for updating email status
 */
export class UpdateEmailStatusDto {
  @ApiProperty({
    description: 'New status for the email (column statusId)',
    example: 'todo',
  })
  @IsNotEmpty({ message: 'Status is required' })
  @IsString({ message: 'Status must be a string' })
  status: string;
}

