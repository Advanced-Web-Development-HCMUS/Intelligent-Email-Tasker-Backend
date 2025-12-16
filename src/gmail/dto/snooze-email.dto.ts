import { IsNotEmpty, IsNumber, IsDateString, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for snoozing an email
 * Supports both ISO date string and Unix timestamp (milliseconds)
 */
export class SnoozeEmailDto {
  @ApiProperty({
    description: 'Date and time when the email should be restored. Can be ISO date string or Unix timestamp (ms)',
    example: '2024-12-31T23:59:59Z',
    oneOf: [
      { type: 'string', format: 'date-time' },
      { type: 'number', format: 'int64' },
    ],
  })
  @IsNotEmpty({ message: 'Snooze until date is required' })
  @Transform(({ value }) => {
    // If it's a number (timestamp), convert to Date
    if (typeof value === 'number') {
      return new Date(value);
    }
    // If it's a string, try to parse it
    if (typeof value === 'string') {
      // Check if it's a timestamp string
      const numValue = Number(value);
      if (!isNaN(numValue) && value.trim() === numValue.toString()) {
        return new Date(numValue);
      }
      // Otherwise treat as ISO date string
      return new Date(value);
    }
    return value;
  })
  @Type(() => Date)
  snoozeUntil: Date;
}

