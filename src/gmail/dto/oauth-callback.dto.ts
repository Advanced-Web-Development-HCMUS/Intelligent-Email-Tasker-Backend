import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for OAuth callback
 */
export class OAuthCallbackDto {
  @ApiProperty({
    description: 'Authorization code from Google OAuth',
    example: '4/0AeanS...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Authorization code is required' })
  code: string;

  @ApiProperty({
    description: 'State parameter for CSRF protection (optional)',
    example: 'random-state-string',
    required: false,
  })
  @IsString()
  state?: string;
}

