import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { Request } from 'express';

/**
 * JWT Strategy for passport authentication
 * Supports token extraction from:
 * 1. Authorization header (Bearer token) - preferred
 * 2. Query parameter (?token=...) - for redirects where headers can't be set
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          // Extract from query parameter if not in header
          return (request.query?.token as string) || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secret-key',
    });
  }

  /**
   * Validate JWT payload
   */
  async validate(payload: any): Promise<any> {
    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { userId: user.id, email: user.email, name: user.name };
  }
}
