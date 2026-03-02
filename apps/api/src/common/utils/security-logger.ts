import { Logger } from '@nestjs/common';
import { maskApiKey, sanitizeErrorMessage } from './security.utils';

export class SecurityLogger {
  private readonly logger = new Logger('Security');

  /**
   * Log authentication attempt
   */
  authAttempt(
    userId: string,
    method: string,
    success: boolean,
    requestId: string,
  ) {
    this.logger.log(
      JSON.stringify({
        event: 'auth_attempt',
        userId: userId || 'anonymous',
        method,
        success,
        requestId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /**
   * Log API key usage
   */
  apiKeyUsage(keyPrefix: string, endpoint: string, requestId: string) {
    this.logger.log(
      JSON.stringify({
        event: 'api_key_usage',
        keyPrefix: maskApiKey(keyPrefix),
        endpoint,
        requestId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /**
   * Log security violation
   */
  securityViolation(type: string, details: any, requestId: string) {
    this.logger.warn(
      JSON.stringify({
        event: 'security_violation',
        type,
        details: this.sanitizeDetails(details),
        requestId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /**
   * Log webhook validation
   */
  webhookValidation(eventType: string, valid: boolean, requestId: string) {
    this.logger.log(
      JSON.stringify({
        event: 'webhook_validation',
        eventType,
        valid,
        requestId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  private sanitizeDetails(details: any): any {
    if (typeof details === 'string') {
      return sanitizeErrorMessage(details);
    }

    if (typeof details !== 'object' || details === null) {
      return details;
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeErrorMessage(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}

export const securityLogger = new SecurityLogger();
