import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for replying to email
 */
export class ReplyEmailDto {
  @ApiProperty({
    description: 'Reply body (HTML or plain text)',
    example: '<p>This is my reply</p>',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reply body is required' })
  body: string;
}

