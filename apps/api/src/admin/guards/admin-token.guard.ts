import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Guard for admin-only endpoints.
 *
 * The billingos-admin dashboard sends a shared service token in the
 * `x-admin-token` header (or `Authorization: Bearer ...`). This guard
 * verifies it against `ADMIN_SERVICE_TOKEN` using a constant-time compare.
 *
 * The token is shared rather than per-user because the dashboard already
 * authenticates the operator with their own bcrypt + JWT login and writes
 * the operator's identity to its own audit log. Per-user attribution lives
 * in admin-app land; the API just needs to know the request came from
 * "the admin dashboard, not a customer."
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly logger = new Logger(AdminTokenGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('ADMIN_SERVICE_TOKEN');
    if (!expected || expected.length < 32) {
      this.logger.error(
        'ADMIN_SERVICE_TOKEN is not configured (or too short). Refusing all admin requests.',
      );
      throw new UnauthorizedException('Admin endpoints not configured');
    }

    const request = context.switchToHttp().getRequest();
    const headerToken =
      (request.headers['x-admin-token'] as string | undefined) ??
      this.extractBearer(
        request.headers['authorization'] as string | undefined,
      );

    if (!headerToken) {
      throw new UnauthorizedException('Missing admin token');
    }

    if (!constantTimeEqual(headerToken, expected)) {
      throw new UnauthorizedException('Invalid admin token');
    }

    return true;
  }

  private extractBearer(header?: string): string | undefined {
    if (!header) return undefined;
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match?.[1];
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers. If lengths differ we still
  // run a compare against `b` itself to keep timing roughly even, then return
  // false.
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
