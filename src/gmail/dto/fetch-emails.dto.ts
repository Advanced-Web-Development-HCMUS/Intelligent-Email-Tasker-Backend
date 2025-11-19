import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for fetching Gmail emails
 */
export class FetchEmailsDto {
  @ApiProperty({
    description: 'Google OAuth access token',
    example: 'ya29.a0AfH6SMBx...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Access token is required' })
  accessToken: string;

  @ApiProperty({
    description: 'Google OAuth refresh token (optional)',
    example: '1//0g...',
    required: false,
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiProperty({
    description: 'Maximum number of emails to fetch',
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 500,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(500)
  maxResults?: number;
}

