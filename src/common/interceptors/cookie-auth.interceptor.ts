import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class CookieAuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest();
    
    // Chỉ apply cho auth endpoints có refresh token
    const isAuthEndpoint = request.url.includes('/auth/') && 
      ['register', 'login', 'google'].some(endpoint => 
        request.url.includes(endpoint)
      );

    if (!isAuthEndpoint) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        if (data?.success && data.data?.refreshToken) {
          // Set HttpOnly cookie
          response.cookie('refreshToken', data.data.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
          });

          // Remove refreshToken từ response
          const { refreshToken, ...cleanData } = data.data;
          return { ...data, data: cleanData };
        }
        return data;
      }),
    );
  }
}