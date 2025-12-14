import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:3000/auth/google/callback',
      scope: [
        'email',
        'profile',
        // Gmail API scopes for full email access
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
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

      // Save Gmail OAuth tokens - CRITICAL for Gmail API access
      // Only update if we got a refresh token (not always provided)
      if (refreshToken) {
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 1); // Access tokens typically expire in 1 hour

        let gmailToken = await this.gmailTokenRepository.findOne({
          where: { userId: user.id },
        });

        if (gmailToken) {
          // Update existing token
          gmailToken.refreshToken = refreshToken;
          gmailToken.accessToken = accessToken;
          gmailToken.accessTokenExpiry = expiryDate;
          await this.gmailTokenRepository.save(gmailToken);
        } else {
          // Create new token record
          gmailToken = this.gmailTokenRepository.create({
            userId: user.id,
            refreshToken: refreshToken,
            accessToken: accessToken,
            accessTokenExpiry: expiryDate,
          });
          await this.gmailTokenRepository.save(gmailToken);
        }
      } else if (!refreshToken) {
        // Warning: No refresh token received
        // This can happen if user previously authorized and prompt=consent not set
        console.warn(
          `No refresh token received for user ${user.email}. ` +
            'User may need to re-authorize or revoke access and try again.',
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
