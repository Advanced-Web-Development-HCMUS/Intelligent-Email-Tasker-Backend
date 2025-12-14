import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard for Google OAuth authentication
 * Uses 'google' strategy from GoogleStrategy
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {}
