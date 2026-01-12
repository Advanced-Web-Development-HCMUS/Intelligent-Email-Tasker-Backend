import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for forwarding email
 */
export class ForwardEmailDto {
  @ApiProperty({
    description: 'Recipients to forward to',
    example: ['recipient@example.com'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty({ message: 'At least one recipient is required' })
  to: string[];

  @ApiPropertyOptional({
    description: 'Optional message to add before forwarded content',
    example: 'Please see the forwarded message below.',
  })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({
    description: 'CC recipients',
    example: ['cc@example.com'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  cc?: string[];
}
