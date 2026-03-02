import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { securityLogger } from '../utils/security-logger';
import {
  getContextPath,
  rateLimitConfig,
  shouldSkipAllRateLimiting,
  shouldSkipPath,
} from '../../config/rate-limit.config';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AppThrottlerGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (shouldSkipAllRateLimiting()) {
      return true;
    }

    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw error;
      }

      if (rateLimitConfig.enableGracefulDegradation) {
        this.logger.error(
          'Rate limiter failed, bypassing request',
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          error as any,
        );
        return true;
      }

      throw error;
    }
  }

  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (shouldSkipAllRateLimiting()) {
      return Promise.resolve(true);
    }

    const path = getContextPath(context);
    return Promise.resolve(shouldSkipPath(path));
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: any,
  ): Promise<void> {
    if (rateLimitConfig.logViolations) {
      const request = context.switchToHttp().getRequest<any>();
      const requestId = request?.requestId || 'no-request-id';

      securityLogger.securityViolation(
        'rate_limit_exceeded',
        {
          limit: throttlerLimitDetail.limit,
          totalHits: throttlerLimitDetail.totalHits,
          ttl: throttlerLimitDetail.ttl,
          path: request?.originalUrl || request?.url,
          method: request?.method,
          tracker: throttlerLimitDetail.tracker,
        },
        requestId,
      );
    }

    await super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
