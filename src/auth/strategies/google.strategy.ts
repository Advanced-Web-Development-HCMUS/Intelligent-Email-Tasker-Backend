import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { GmailToken } from '../../gmail/entities/gmail-token.entity';

/**
 * Google OAuth2 Strategy - BACKEND-DRIVEN ONLY
 *
 * Flow:
 * 1. User clicks login -> Redirected to /auth/google
 * 2. Backend redirects to Google consent screen
 * 3. User authorizes -> Google redirects to /auth/google/callback with authorization code
 * 4. This strategy exchanges code for access/refresh tokens
 * 5. Backend stores tokens and returns JWT to frontend
 *
 * This is OAuth2 Authorization Code Flow - NOT frontend-driven Google Sign-In
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GmailToken)
    private readonly gmailTokenRepository: Repository<GmailToken>,
    private readonly configService: ConfigService,
  ) {
    // Match Gmail flow config exactly
    const googleRedirectUri =
      configService.get<string>('GOOGLE_REDIRECT_URI') ||
      `http://localhost:${configService.get<string>('PORT') || '3001'}/auth/oauth/callback`;

    console.log('🔍 GoogleStrategy Config:', {
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')?.substring(0, 20) + '...',
      callbackURL: googleRedirectUri,
      port: configService.get<string>('PORT'),
    });

    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: googleRedirectUri,
      scope: [
        'email',
        'profile',
        // NOTE: Gmail scopes removed from initial auth
        // Users must use /gmail/auth to connect Gmail (incremental authorization)
        // This ensures refresh_token is obtained when Gmail access is needed
      ],
      accessType: 'offline', // CRITICAL: Get refresh token
      prompt: 'consent', // Force consent screen to get refresh token every time
    });
  }

  /**
   * Validate and process Google OAuth callback
   *
   * Called automatically by Passport after Google redirects back with authorization code
   * Passport has already exchanged the code for tokens before calling this
   *
   * @param accessToken - Google access token (short-lived, ~1 hour)
   * @param refreshToken - Google refresh token (long-lived, used to get new access tokens)
   * @param profile - User profile from Google
   * @param done - Passport callback
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      // 🔍 DEBUG: Log what Google returned
      console.log('=== GOOGLE OAUTH VALIDATE ===');
      console.log(
        'accessToken:',
        accessToken ? `${accessToken.substring(0, 20)}...` : 'NULL',
      );
      console.log(
        'refreshToken:',
        refreshToken ? `${refreshToken.substring(0, 20)}...` : 'NULL ❌',
      );
      console.log('profile.id:', profile.id);
      console.log('profile.emails:', profile.emails);
      console.log('profile._json.scope:', profile._json?.scope);
      console.log('=============================');

      const { id: googleId, emails, displayName } = profile;

      if (!emails || emails.length === 0) {
        return done(new Error('No email found in Google profile'), null);
      }

      const email = emails[0].value;
      const name = displayName || 'Google User';

      // Find or create user
      let user = await this.userRepository.findOne({
        where: { googleId },
      });

      if (!user) {
        // Try to find by email (link existing account)
        user = await this.userRepository.findOne({
          where: { email },
        });

        if (user) {
          // Link Google account to existing user
          user.googleId = googleId;
          await this.userRepository.save(user);
        } else {
          // Create new user (OAuth user - no password)
          user = this.userRepository.create({
            email,
            name,
            googleId,
            password: null, // OAuth users don't have passwords
          });
          await this.userRepository.save(user);
        }
      } else {
        // Update user info if changed
        if (user.name !== name) {
          user.name = name;
          await this.userRepository.save(user);
        }
      }

      // Save Gmail OAuth tokens - ONLY if refresh token provided
      // NOTE: With incremental authorization (minimal scopes in initial auth),
      // refresh_token will NOT be provided here. Users must connect Gmail separately.
      if (refreshToken) {
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 1); // Access tokens typically expire in 1 hour

        let gmailToken = await this.gmailTokenRepository.findOne({
          where: { userId: user.id },
        });

        if (gmailToken) {
          // Update existing token
          console.log('Updating existing token');
          gmailToken.refreshToken = refreshToken;
          gmailToken.accessToken = accessToken;
          gmailToken.accessTokenExpiry = expiryDate;
          await this.gmailTokenRepository.save(gmailToken);
        } else {
          // Create new token record
          console.log('Creating new token record');
          gmailToken = this.gmailTokenRepository.create({
            userId: user.id,
            refreshToken: refreshToken,
            accessToken: accessToken,
            accessTokenExpiry: expiryDate,
          });
          await this.gmailTokenRepository.save(gmailToken);
        }
      } else if (!refreshToken) {
        // Expected: No refresh token in initial auth flow (incremental authorization)
        // User should connect Gmail separately via /gmail/auth to get refresh_token
        console.log(
          `✓ User ${user.email} signed in with Google (no Gmail access yet). ` +
            'User can connect Gmail later via /gmail/auth endpoint.',
        );
      }

      // Return user - will be attached to req.user by Passport
      done(null, user);
    } catch (error) {
      console.error('Google OAuth validation error:', error);
      done(error, null);
    }
  }
}
