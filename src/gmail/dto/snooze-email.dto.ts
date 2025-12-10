import { IsDate, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for snoozing an email
 */
export class SnoozeEmailDto {
  @ApiProperty({
    description: 'Date and time when the email should be restored',
    example: '2024-12-31T23:59:59Z',
  })
  @IsNotEmpty({ message: 'Snooze until date is required' })
  @IsDate({ message: 'Snooze until must be a valid date' })
  @Type(() => Date)
  snoozeUntil: Date;
}

