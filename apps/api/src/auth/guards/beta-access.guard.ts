import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { BETA_EXEMPT_KEY } from '../decorators/beta-exempt.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { isPrivateBetaEnabled } from '../../config/private-beta.config';
import { User } from '../../user/entities/user.entity';

/**
 * Blocks requests from authenticated users whose `access_status` is not
 * `'approved'` while the private-beta gate is on. Skips when the flag is off,
 * when the route is public/exempt, or when the user is_admin / approved.
 *
 * Registered as APP_GUARD in AppModule. Runs after JwtAuthGuard /
 * SessionTokenAuthGuard have populated `req.user`. If `req.user` is missing
 * (anonymous request to a public route) the guard lets it through — the
 * upstream auth guard owns that decision.
 */
@Injectable()
export class BetaAccessGuard implements CanActivate {
  private readonly logger = new Logger(BetaAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = isPrivateBetaEnabled(this.configService);
    if (!enabled) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isExempt = this.reflector.getAllAndOverride<boolean>(BETA_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) return true;

    const request = context.switchToHttp().getRequest<{
      user?: User;
      url?: string;
      method?: string;
    }>();
    const user = request.user;
    if (!user) return true;

    if (user.is_admin) return true;
    if (user.access_status === 'approved') return true;

    this.logger.warn(
      `[beta-gate] blocking ${request.method ?? '?'} ${request.url ?? '?'} ` +
        `user=${user.id} access_status=${user.access_status ?? 'unknown'}`,
    );

    throw new ForbiddenException({
      code: 'BETA_PENDING',
      message:
        'Your account is awaiting approval for the BillingOS private beta.',
      access_status: user.access_status ?? 'pending',
    });
  }
}
