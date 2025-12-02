import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { TBaseDTO } from '../../common/dto/base.dto';

/**
 * Interceptor to handle refresh token cookies
 */
@Injectable()
export class CookieAuthInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // Check if this is an auth response containing refresh token
        if (data && data.data && this.isAuthResponse(data.data)) {
          const authData = data.data as AuthResponseDto;
          
          if (authData.refreshToken) {
            // Set refresh token as httpOnly cookie
            response.cookie('refreshToken', authData.refreshToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production', // HTTPS in production
              sameSite: 'strict',
              maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
              path: '/',
            });

            // Remove refresh token from response body
            const { refreshToken, ...authDataWithoutRefreshToken } = authData;
            
            return new TBaseDTO<Omit<AuthResponseDto, 'refreshToken'>>(
              authDataWithoutRefreshToken,
              data.message,
              data.error,
            );
          }
        }

        return data;
      }),
    );
  }

  /**
   * Type guard to check if data is AuthResponseDto
   */
  private isAuthResponse(data: any): data is AuthResponseDto {
    return (
      data &&
      typeof data === 'object' &&
      'user' in data &&
      'accessToken' in data &&
      'refreshToken' in data
    );
  }
}