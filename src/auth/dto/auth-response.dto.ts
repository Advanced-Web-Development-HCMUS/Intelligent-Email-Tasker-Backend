import { ApiProperty } from '@nestjs/swagger';

/**
 * User information in auth response
 */
export class UserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;
}

/**
 * Authentication response with tokens (internal use - includes refresh token)
 */
export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImlhdCI6MTYzMzI1NjAwMCwiZXhwIjoxNjMzMjU5NjAwfQ...',
  })
  accessToken: string;

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImlhdCI6MTYzMzI1NjAwMCwiZXhwIjoxNjMzMzQyNDAwfQ...',
  })
  refreshToken: string;
}

/**
 * Public authentication response (no refresh token - stored in httpOnly cookie)
 */
export class PublicAuthResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImlhdCI6MTYzMzI1NjAwMCwiZXhwIjoxNjMzMjU5NjAwfQ...',
  })
  accessToken: string;
}

