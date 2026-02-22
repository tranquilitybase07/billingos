import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SessionTokensService } from '../../session-tokens/session-tokens.service';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Flexible auth guard that supports both JWT (Supabase) and Session Token authentication
 *
 * Authentication flow:
 * 1. Check if route is marked as @Public() - if yes, skip auth
 * 2. Extract token from Authorization header
 * 3. Try to validate as Session Token first (for SDK)
 * 4. If session token fails, try JWT validation (for BillingOS web app)
 * 5. If both fail, throw UnauthorizedException
 *
 * This allows the same endpoints to be used by both:
 * - BillingOS web app (uses Supabase JWT tokens)
 * - BillingOS SDK (uses session tokens)
 */
@Injectable()
export class JwtOrSessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessionTokensService: SessionTokensService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Extract token from Authorization header
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authorization.substring('Bearer '.length);

    // Try Session Token authentication first (for SDK)
    try {
      const sessionPayload = await this.sessionTokensService.validate(token);

      // Attach session token payload to request
      request.sessionToken = sessionPayload;
      request.customer = {
        externalUserId: sessionPayload.external_user_id,
        externalOrganizationId: sessionPayload.external_organization_id,
        organizationId: sessionPayload.merchant_id,
      };

      // Mark request as coming from SDK
      request.isSDKRequest = true;

      return true;
    } catch (sessionError) {
      // Session token validation failed, try JWT
    }

    // Try JWT authentication (for BillingOS web app)
    try {
      const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      // Attach user to request (consistent with JwtStrategy)
      request.user = { id: payload.sub };

      // Mark request as coming from web app
      request.isSDKRequest = false;

      return true;
    } catch (jwtError) {
      // Both authentication methods failed
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
