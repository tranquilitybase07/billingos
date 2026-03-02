import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseSanitizeInterceptor implements NestInterceptor {
  private readonly blacklistedFields = [
    'password',
    'hashedPassword',
    'salt',
    'refreshToken',
    'stripeCustomerSecret',
    'webhookSecret',
    'apiKeyHash',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.requestId;

    return next.handle().pipe(
      map((data) => {
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          data.requestId = requestId;
        }

        return this.sanitizeResponse(data);
      }),
    );
  }

  private sanitizeResponse(data: any): any {
    if (!data) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeResponse(item));
    }

    if (typeof data !== 'object') {
      return data;
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (this.blacklistedFields.includes(key)) {
        continue;
      }

      if (
        key.toLowerCase().includes('apikey') ||
        key.toLowerCase().includes('api_key')
      ) {
        if (typeof value === 'string' && value.startsWith('sk_')) {
          sanitized[key] = '[REDACTED]';
          continue;
        }
      }

      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeResponse(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
