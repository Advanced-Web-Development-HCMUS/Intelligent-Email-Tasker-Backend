import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsArray, IsEmail, IsOptional } from 'class-validator';

/**
 * DTO for sending email
 */
export class SendEmailDto {
  @ApiProperty({
    description: 'Recipient email addresses',
    example: ['recipient@example.com'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty({ message: 'To addresses are required' })
  @IsEmail({}, { each: true, message: 'Invalid email address' })
  to: string[];

  @ApiProperty({
    description: 'Email subject',
    example: 'Hello from Gmail API',
  })
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @ApiProperty({
    description: 'Email body (HTML or plain text)',
    example: '<p>This is the email body</p>',
  })
  @IsString()
  @IsNotEmpty({ message: 'Body is required' })
  body: string;

  @ApiProperty({
    description: 'CC email addresses',
    example: ['cc@example.com'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @IsEmail({}, { each: true, message: 'Invalid email address' })
  cc?: string[];

  @ApiProperty({
    description: 'BCC email addresses',
    example: ['bcc@example.com'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @IsEmail({}, { each: true, message: 'Invalid email address' })
  bcc?: string[];
}

