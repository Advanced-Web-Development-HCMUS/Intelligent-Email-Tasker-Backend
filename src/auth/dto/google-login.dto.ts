import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for Google OAuth login
 */
export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token from OAuth',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1NiJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Google token is required' })
  googleToken: string;
}

