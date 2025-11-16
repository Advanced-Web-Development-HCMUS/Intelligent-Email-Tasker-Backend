import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, UserDto } from './dto/auth-response.dto';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TBaseDTO } from '../common/dto/base.dto';

/**
 * Service for authentication operations
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Initialize default user on module init
   */
  async onModuleInit(): Promise<void> {
    await this.initializeDefaultUser();
  }

  /**
   * Initialize default user with hashed password
   */
  private async initializeDefaultUser(): Promise<void> {
    const defaultEmail = 'user@example.com';
    const existingUser = await this.userRepository.findOne({
      where: { email: defaultEmail },
    });

    if (!existingUser) {
      const defaultPassword = 'password123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      const defaultUser = this.userRepository.create({
        email: defaultEmail,
        password: hashedPassword,
        name: 'John Doe',
      });

      await this.userRepository.save(defaultUser);
      console.log('Default user created:', defaultEmail);
    }
  }

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto): Promise<TBaseDTO<AuthResponseDto>> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      return new TBaseDTO<AuthResponseDto>(
        undefined,
        undefined,
        'Email already registered',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new user
    const newUser = this.userRepository.create({
      email: registerDto.email,
      password: hashedPassword,
      name: registerDto.name,
    });

    const savedUser = await this.userRepository.save(newUser);

    // Return auth response (auto-login after registration)
    return this.generateAuthResponse(savedUser);
  }

  /**
   * Authenticate user with email and password
   */
  async login(loginDto: LoginDto): Promise<TBaseDTO<AuthResponseDto>> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user || !user.password) {
      return new TBaseDTO<AuthResponseDto>(
        undefined,
        undefined,
        'Invalid email or password',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      return new TBaseDTO<AuthResponseDto>(
        undefined,
        undefined,
        'Invalid email or password',
      );
    }

    return this.generateAuthResponse(user);
  }

  /**
   * Authenticate user with Google OAuth
   */
  async googleLogin(
    googleLoginDto: GoogleLoginDto,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    // In a real implementation, verify the Google token with Google's API
    // For this mock, we'll simulate a successful verification
    try {
      // Mock Google token verification
      // In production, use: https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=TOKEN
      const mockGoogleUser = {
        email: 'google.user@example.com',
        name: 'Google User',
        googleId: 'google_123456789',
      };

      // Find or create user
      let user = await this.userRepository.findOne({
        where: { googleId: mockGoogleUser.googleId },
      });

      if (!user) {
        // Check if user exists with this email
        user = await this.userRepository.findOne({
          where: { email: mockGoogleUser.email },
        });

        if (user) {
          // Update existing user with Google ID
          user.googleId = mockGoogleUser.googleId;
          user.name = mockGoogleUser.name;
          await this.userRepository.save(user);
        } else {
          // Create new user
          user = this.userRepository.create({
            email: mockGoogleUser.email,
            password: null, // No password for Google users
            name: mockGoogleUser.name,
            googleId: mockGoogleUser.googleId,
          });
          await this.userRepository.save(user);
        }
      }

      return this.generateAuthResponse(user);
    } catch (error) {
      return new TBaseDTO<AuthResponseDto>(
        undefined,
        undefined,
        'Invalid Google token',
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
  ): Promise<TBaseDTO<{ accessToken: string }>> {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      });

      // Verify refresh token exists in database
      const refreshTokenEntity = await this.refreshTokenRepository.findOne({
        where: { token: refreshTokenDto.refreshToken },
        relations: ['user'],
      });

      if (
        !refreshTokenEntity ||
        refreshTokenEntity.userId !== payload.sub
      ) {
        return new TBaseDTO<{ accessToken: string }>(
          undefined,
          undefined,
          'Invalid refresh token',
        );
      }

      const user = refreshTokenEntity.user;
      if (!user) {
        return new TBaseDTO<{ accessToken: string }>(
          undefined,
          undefined,
          'User not found',
        );
      }

      // Generate new access token
      const accessToken = this.jwtService.sign(
        { sub: user.id, email: user.email },
        {
          secret: process.env.JWT_SECRET || 'secret-key',
          expiresIn: this.ACCESS_TOKEN_EXPIRY,
        },
      );

      return new TBaseDTO<{ accessToken: string }>({ accessToken });
    } catch (error) {
      return new TBaseDTO<{ accessToken: string }>(
        undefined,
        undefined,
        'Invalid or expired refresh token',
      );
    }
  }

  /**
   * Generate authentication response with tokens
   */
  private async generateAuthResponse(
    user: User,
  ): Promise<TBaseDTO<AuthResponseDto>> {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'secret-key',
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });

    // Store refresh token in database
    const refreshTokenEntity = this.refreshTokenRepository.create({
      token: refreshToken,
      userId: user.id,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    const userDto: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    const authResponse: AuthResponseDto = {
      user: userDto,
      accessToken,
      refreshToken,
    };

    return new TBaseDTO<AuthResponseDto>(authResponse);
  }

  /**
   * Validate user by ID (for JWT strategy)
   */
  async validateUser(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * Revoke refresh token (on logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.delete({ token: refreshToken });
  }
}
