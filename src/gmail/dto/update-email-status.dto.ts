import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Valid Kanban status values
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
    description: 'New status for the email',
    enum: KanbanStatus,
    example: KanbanStatus.TODO,
  })
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(KanbanStatus, { message: 'Status must be one of: inbox, todo, in_progress, done, snoozed' })
  status: KanbanStatus;
}

