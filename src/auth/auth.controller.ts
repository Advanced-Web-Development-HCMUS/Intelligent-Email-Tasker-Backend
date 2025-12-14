import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Response,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { TBaseDTO } from '../common/dto/base.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';

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
  @ApiResponse({
    status: 400,
    description: 'Email already registered or validation error',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Response({ passthrough: true }) res: any,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    const result = await this.authService.register(registerDto);

    if (result.data?.refreshToken) {
      this.setRefreshTokenCookie(res, result.data.refreshToken);
      // Remove refreshToken from response body
      delete result.data.refreshToken;
    }

    return result;
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
    @Response({ passthrough: true }) res: any,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    const result = await this.authService.login(loginDto);

    if (result.data?.refreshToken) {
      this.setRefreshTokenCookie(res, result.data.refreshToken);
      // Remove refreshToken from response body
      delete result.data.refreshToken;
    }

    return result;
  }

  /**
   * Initiate Google OAuth login - BACKEND-DRIVEN FLOW
   *
   * Step 1: User visits this endpoint
   * Step 2: Backend redirects to Google's consent screen
   * Step 3: User authorizes on Google
   * Step 4: Google redirects to /auth/google/callback
   *
   * @UseGuards(GoogleOAuthGuard) triggers Passport to redirect to Google
   */
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Initiate Google OAuth2 login (Backend-Driven)',
    description:
      'Redirects user to Google OAuth2 consent screen. ' +
      'This is the entry point for backend-driven OAuth flow.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google OAuth consent screen',
  })
  async googleAuth(): Promise<void> {
    // Guard automatically handles redirect to Google
    // No code needed here
  }

  /**
   * Google OAuth callback - BACKEND-DRIVEN FLOW
   *
   * Step 5: Google redirects here with authorization code
   * Step 6: Passport exchanges code for access/refresh tokens (automatic)
   * Step 7: GoogleStrategy validates and saves user + Gmail tokens
   * Step 8: Backend generates JWT tokens
   * Step 9: Redirect to frontend with JWT access token
   *
   * The frontend should:
   * 1. Extract token from URL query param
   * 2. Store in localStorage/sessionStorage
   * 3. Use for subsequent API calls
   * 4. Refresh token is stored as httpOnly cookie for security
   */
  @Get('oauth/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiExcludeEndpoint() // Hide from Swagger - this is a redirect endpoint
  async googleAuthCallback(
    @Req() req: any,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    try {
      // User is attached to req.user by GoogleStrategy after successful OAuth
      const user = req.user;

      if (!user) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=authentication_failed`);
      }

      // Generate JWT tokens for our app
      const authResponse = await this.authService.generateAuthResponse(user);

      if (!authResponse.data) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(
          `${frontendUrl}/login?error=token_generation_failed`,
        );
      }

      // Set refresh token as httpOnly cookie (secure, can't be accessed by JavaScript)
      this.setRefreshTokenCookie(res, authResponse.data.refreshToken);

      // Redirect to frontend with access token in URL
      // Frontend should extract and store in localStorage, then clear from URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${authResponse.data.accessToken}`;

      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=callback_failed`);
    }
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
    @Request() req: any,
  ): Promise<TBaseDTO<{ accessToken: string }>> {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return new TBaseDTO<{ accessToken: string }>(
        undefined,
        undefined,
        'Refresh token not found',
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
    @Response({ passthrough: true }) res: any,
  ): Promise<TBaseDTO<{ message: string }>> {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    // Clear refresh token cookie
    this.clearRefreshTokenCookie(res);

    return new TBaseDTO<{ message: string }>({
      message: 'Logged out successfully',
    });
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

  /**
   * Set refresh token as httpOnly cookie
   */
  private setRefreshTokenCookie(res: any, refreshToken: string): void {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true in production (HTTPS)
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  /**
   * Clear refresh token cookie
   */
  private clearRefreshTokenCookie(res: any): void {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
}
