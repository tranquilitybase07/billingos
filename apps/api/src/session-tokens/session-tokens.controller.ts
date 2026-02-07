import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionTokensService } from './session-tokens.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateSessionTokenDto } from './dto/create-session-token.dto';
import { SessionTokenResponseDto } from './dto/session-token-response.dto';

@ApiTags('SDK - Session Tokens')

@Controller('v1/session-tokens')
export class SessionTokensController {
  constructor(
    private readonly sessionTokensService: SessionTokensService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  /**
   * Create a new session token
   * Requires API key authentication (Bearer sk_live_* or sk_test_*)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Headers('authorization') authorization: string,
    @Body() createDto: CreateSessionTokenDto,
  ): Promise<SessionTokenResponseDto> {
    // Extract API key from Authorization header
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const apiKey = authorization.substring('Bearer '.length);

    // Validate API key
    const apiKeyRecord = await this.apiKeysService.validate(apiKey);

    // Create session token
    const { sessionToken, token } = await this.sessionTokensService.create(
      apiKeyRecord.id,
      apiKeyRecord.organization_id,
      createDto,
    );

    // Parse allowed_operations from JSONB string
    const allowedOperations = sessionToken.allowed_operations
      ? JSON.parse(sessionToken.allowed_operations as any)
      : undefined;

    return {
      sessionToken: token, // Full token string
      expiresAt: new Date(sessionToken.expires_at),
      allowedOperations,
    };
  }

  /**
   * Revoke a session token
   * Requires API key authentication
   */
  @Delete(':tokenId')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Headers('authorization') authorization: string,
    @Param('tokenId') tokenId: string,
  ): Promise<{ message: string }> {
    // Extract and validate API key
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const apiKey = authorization.substring('Bearer '.length);
    const apiKeyRecord = await this.apiKeysService.validate(apiKey);

    // Revoke token
    await this.sessionTokensService.revoke(apiKeyRecord.organization_id, tokenId);

    return {
      message: 'Session token revoked successfully',
    };
  }
}
