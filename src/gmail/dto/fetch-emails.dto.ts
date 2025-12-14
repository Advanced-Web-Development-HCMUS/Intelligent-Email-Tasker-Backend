import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for fetching Gmail emails
 */
export class FetchEmailsDto {
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
