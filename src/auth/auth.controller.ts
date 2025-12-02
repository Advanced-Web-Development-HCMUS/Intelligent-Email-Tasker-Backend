import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Request,
  Req,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
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
import { AuthResponseDto, PublicAuthResponseDto } from './dto/auth-response.dto';
import { TBaseDTO } from '../common/dto/base.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CookieAuthInterceptor } from './interceptors/cookie-auth.interceptor';

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
  @UseInterceptors(CookieAuthInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: TBaseDTO<PublicAuthResponseDto>,
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
  @UseInterceptors(CookieAuthInterceptor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TBaseDTO<PublicAuthResponseDto>,
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
  @UseInterceptors(CookieAuthInterceptor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Google OAuth' })
  @ApiResponse({
    status: 200,
    description: 'Google login successful',
    type: TBaseDTO<PublicAuthResponseDto>,
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
    @Req() req: ExpressRequest,
  ): Promise<TBaseDTO<{ accessToken: string }>> {
    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      return new TBaseDTO<{ accessToken: string }>(
        undefined,
        undefined,
        'No refresh token provided',
      );
    }

    return this.authService.refreshToken({ refreshToken });
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
  async logout(
    @Request() req: any,
    @Req() request: ExpressRequest,
  ): Promise<TBaseDTO<{ message: string }>> {
    const refreshToken = request.cookies?.refreshToken;
    
    // Revoke refresh token if exists
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }
    
    // Clear refresh token cookie
    const response = request.res;
    if (response) {
      response.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });
    }
    
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

