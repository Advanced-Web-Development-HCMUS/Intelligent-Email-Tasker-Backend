import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { TBaseDTO } from '../common/dto/base.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Controller for authentication endpoints
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: TBaseDTO<AuthResponseDto>,
  })
  @ApiResponse({ status: 400, description: 'Email already registered or validation error' })
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    return this.authService.register(registerDto);
  }

  /**
   * Login with email and password
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TBaseDTO<AuthResponseDto>,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    return this.authService.login(loginDto);
  }

  /**
   * Login with Google OAuth
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Google OAuth' })
  @ApiResponse({
    status: 200,
    description: 'Google login successful',
    type: TBaseDTO<AuthResponseDto>,
  })
  @ApiResponse({ status: 401, description: 'Invalid Google token' })
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    return this.authService.googleLogin(googleLoginDto);
  }

  /**
   * Refresh access token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TBaseDTO<{ accessToken: string }>,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<TBaseDTO<{ accessToken: string }>> {
    return this.authService.refreshToken(refreshTokenDto);
  }

  /**
   * Logout (revoke refresh token)
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    type: TBaseDTO<{ message: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Request() req: any): Promise<TBaseDTO<{ message: string }>> {
    // In a real implementation, you would revoke the refresh token here
    // For this mock, we'll just return success
    return new TBaseDTO<{ message: string }>({ message: 'Logged out successfully' });
  }

  /**
   * Get current user profile
   */
  @Post('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved',
    type: TBaseDTO<{ userId: number; email: string; name: string }>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(
    @Request() req: any,
  ): Promise<TBaseDTO<{ userId: number; email: string; name: string }>> {
    return new TBaseDTO<{ userId: number; email: string; name: string }>({
      userId: req.user.userId,
      email: req.user.email,
      name: req.user.name,
    });
  }
}

