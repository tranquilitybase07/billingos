import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  ApiKeyResponseDto,
  ApiKeyPairCreatedResponseDto,
} from './dto/api-key-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@Controller('organizations/:organizationId/api-keys')
@UseGuards(JwtAuthGuard) // Requires authentication
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * Create a new API key pair for an organization (like Stripe)
   * Returns both secret and publishable keys ONCE (never shown again)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Body() createDto: CreateApiKeyDto,
  ): Promise<ApiKeyPairCreatedResponseDto> {
    // TODO: Verify user is admin of this organization
    // For now, we trust the JwtAuthGuard

    const { secretKey, publishableKey, secretFullKey, publishableFullKey } =
      await this.apiKeysService.create(organizationId, createDto);

    return {
      pairId: secretKey.key_pair_id!,
      name: secretKey.name || undefined,
      environment: secretKey.environment,
      secretKey: {
        id: secretKey.id,
        keyPrefix: secretKey.key_prefix,
        fullKey: secretFullKey, // ONLY shown when creating
      },
      publishableKey: {
        id: publishableKey.id,
        keyPrefix: publishableKey.key_prefix,
        fullKey: publishableFullKey, // ONLY shown when creating
      },
      createdAt: new Date(secretKey.created_at),
      warning: '⚠️  Save these keys securely - they will never be shown again!',
    };
  }

  /**
   * List all API keys for an organization
   */
  @Get()
  async findAll(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query('includeRevoked') includeRevoked?: string,
  ): Promise<ApiKeyResponseDto[]> {
    // TODO: Verify user is member of this organization

    const includeRevokedBool = includeRevoked === 'true';
    const apiKeys = await this.apiKeysService.findAll(
      organizationId,
      includeRevokedBool,
    );

    return apiKeys.map((key) => ({
      id: key.id,
      organizationId: key.organization_id,
      keyType: key.key_type,
      environment: key.environment,
      keyPrefix: key.key_prefix, // Safe to show
      name: key.name || undefined,
      keyPairId: key.key_pair_id || undefined,
      createdAt: new Date(key.created_at),
      lastUsedAt: key.last_used_at ? new Date(key.last_used_at) : undefined,
      revokedAt: key.revoked_at ? new Date(key.revoked_at) : undefined,
    }));
  }

  /**
   * Get a single API key by ID
   */
  @Get(':keyId')
  async findOne(
    @Param('organizationId') organizationId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: User,
  ): Promise<ApiKeyResponseDto> {
    // TODO: Verify user is member of this organization

    const apiKey = await this.apiKeysService.findOne(organizationId, keyId);

    return {
      id: apiKey.id,
      organizationId: apiKey.organization_id,
      keyType: apiKey.key_type,
      environment: apiKey.environment,
      keyPrefix: apiKey.key_prefix,
      name: apiKey.name || undefined,
      keyPairId: apiKey.key_pair_id || undefined,
      createdAt: new Date(apiKey.created_at),
      lastUsedAt: apiKey.last_used_at ? new Date(apiKey.last_used_at) : undefined,
      revokedAt: apiKey.revoked_at ? new Date(apiKey.revoked_at) : undefined,
    };
  }

  /**
   * Revoke an API key pair (soft delete both keys if paired)
   */
  @Delete(':keyId')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('organizationId') organizationId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: User,
  ): Promise<ApiKeyResponseDto[]> {
    // TODO: Verify user is admin of this organization

    const apiKeys = await this.apiKeysService.revoke(organizationId, keyId);

    return apiKeys.map((key) => ({
      id: key.id,
      organizationId: key.organization_id,
      keyType: key.key_type,
      environment: key.environment,
      keyPrefix: key.key_prefix,
      name: key.name || undefined,
      keyPairId: key.key_pair_id || undefined,
      createdAt: new Date(key.created_at),
      lastUsedAt: key.last_used_at ? new Date(key.last_used_at) : undefined,
      revokedAt: key.revoked_at ? new Date(key.revoked_at) : undefined,
    }));
  }
}
