import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionTokensService } from '../../session-tokens/session-tokens.service';
import { SessionTokenPayload } from '../../session-tokens/entities/session-token.entity';

@Injectable()
export class SessionTokenAuthGuard implements CanActivate {
  constructor(private readonly sessionTokensService: SessionTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract session token from Authorization header
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authorization.substring('Bearer '.length);

    // Validate token (throws UnauthorizedException if invalid)
    const payload: SessionTokenPayload = await this.sessionTokensService.validate(token);

    // Attach payload to request for use in controllers
    request.sessionToken = payload;

    // Attach customer context for convenience
    request.customer = {
      externalUserId: payload.external_user_id,
      externalOrganizationId: payload.external_organization_id,
      organizationId: payload.merchant_id,
    };

    return true;
  }
}
