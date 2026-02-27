import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FeaturesService } from '../../features/features.service';
import { CustomersService } from '../../customers/customers.service';
import { ApiKeysService } from '../../api-keys/api-keys.service';

/**
 * V1 Usage Controller (API Key Auth)
 *
 * Endpoints for server-side SDKs that authenticate with API secret keys.
 * Unlike the session-token-based /v1/features/* endpoints, these accept
 * customer_id in the request and validate via API key.
 *
 * Routes:
 * - POST /v1/usage/track - Track usage for a feature
 * - GET /v1/usage/check - Check feature access for a customer
 * - GET /v1/usage/metrics - Get usage metrics for a customer
 */
@ApiTags('SDK - Usage (API Key Auth)')
@Controller('v1/usage')
export class V1UsageController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly customersService: CustomersService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  /**
   * Validate API key from Authorization header and return organization_id
   */
  private async validateApiKey(authHeader: string): Promise<string> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const apiKey = authHeader.replace('Bearer ', '');
    if (!apiKey.startsWith('sk_')) {
      throw new UnauthorizedException('Invalid API key format. Use a secret key (sk_live_* or sk_test_*)');
    }

    const keyRecord = await this.apiKeysService.validate(apiKey);
    return keyRecord.organization_id;
  }

  /**
   * Resolve customer by external_id within organization
   */
  private async resolveCustomer(customerId: string, organizationId: string) {
    // Try finding by external_id first
    const customer = await this.customersService.findOneByExternalId(
      customerId,
      organizationId,
    );

    if (!customer) {
      throw new BadRequestException(`Customer not found: ${customerId}`);
    }

    return customer;
  }

  /**
   * Track usage for a feature
   *
   * @example
   * POST /v1/usage/track
   * Headers: Authorization: Bearer sk_live_xxx
   * Body: { customer_id: "user_123", feature_key: "api_calls", quantity: 1 }
   */
  @Post('track')
  async trackUsage(
    @Headers('authorization') authHeader: string,
    @Body() body: {
      customer_id: string;
      feature_key: string;
      quantity: number;
      idempotency_key?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const organizationId = await this.validateApiKey(authHeader);

    if (!body.customer_id || !body.feature_key || !body.quantity) {
      throw new BadRequestException('customer_id, feature_key, and quantity are required');
    }

    const customer = await this.resolveCustomer(body.customer_id, organizationId);

    const result = await this.featuresService.trackUsage({
      customer_id: customer.id,
      feature_name: body.feature_key,
      units: body.quantity,
      idempotency_key: body.idempotency_key,
    });

    return {
      success: true,
      feature_key: body.feature_key,
      quantity: body.quantity,
      recorded_at: new Date().toISOString(),
      usage: result.usage,
    };
  }

  /**
   * Check feature access for a customer
   *
   * @example
   * GET /v1/usage/check?customer_id=user_123&feature_key=api_calls
   * Headers: Authorization: Bearer sk_live_xxx
   */
  @Get('check')
  async checkAccess(
    @Headers('authorization') authHeader: string,
    @Query('customer_id') customerId: string,
    @Query('feature_key') featureKey: string,
  ) {
    const organizationId = await this.validateApiKey(authHeader);

    if (!customerId || !featureKey) {
      throw new BadRequestException('customer_id and feature_key are required');
    }

    const customer = await this.resolveCustomer(customerId, organizationId);

    const access = await this.featuresService.checkAccess(
      customer.id,
      featureKey,
    );

    return {
      feature_key: featureKey,
      has_access: access.has_access,
      reason: access.reason,
      limit: access.feature?.properties?.limit ?? null,
      usage: access.feature?.properties?.consumed ?? null,
      metadata: access.feature ? {
        remaining: access.feature.properties?.remaining,
        resets_at: access.feature.properties?.resets_at,
        type: access.feature.type,
      } : null,
    };
  }

  /**
   * Get usage metrics for a customer
   *
   * @example
   * GET /v1/usage/metrics?customer_id=user_123&feature_key=api_calls
   * Headers: Authorization: Bearer sk_live_xxx
   */
  @Get('metrics')
  async getUsageMetrics(
    @Headers('authorization') authHeader: string,
    @Query('customer_id') customerId: string,
    @Query('feature_key') featureKey?: string,
  ) {
    const organizationId = await this.validateApiKey(authHeader);

    if (!customerId) {
      throw new BadRequestException('customer_id is required');
    }

    const customer = await this.resolveCustomer(customerId, organizationId);

    const metrics = await this.featuresService.getUsageMetrics(
      customer.id,
      featureKey,
    );

    return {
      metrics,
      customer_id: customerId,
    };
  }
}
