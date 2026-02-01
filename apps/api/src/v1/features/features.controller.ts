import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FeaturesService } from '../../features/features.service';
import { SessionTokenAuthGuard } from '../../auth/guards/session-token-auth.guard';
import { CurrentCustomer, CustomerContext } from '../../auth/decorators/current-customer.decorator';
import { CustomersService } from '../../customers/customers.service';

/**
 * Features SDK Controller
 *
 * This controller provides feature gating and usage tracking endpoints for the SDK.
 * All endpoints require session token authentication.
 *
 * Routes:
 * - GET /v1/features/check - Check if customer has access to a feature
 * - POST /v1/features/track-usage - Track usage for a feature
 * - GET /v1/features/entitlements - List all customer entitlements
 * - GET /v1/features/usage-metrics - Get usage metrics for features
 */
@Controller('v1/features')
@UseGuards(SessionTokenAuthGuard)
export class V1FeaturesController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly customersService: CustomersService,
  ) {}

  /**
   * Check if customer has access to a feature
   *
   * @example
   * GET /v1/features/check?feature_key=api_calls
   * Headers: Authorization: Bearer bos_session_xxx
   */
  @Get('check')
  async checkAccess(
    @CurrentCustomer() customer: CustomerContext,
    @Query('feature_key') featureKey: string,
  ) {
    if (!featureKey) {
      throw new BadRequestException('feature_key parameter is required');
    }

    // Get customer record
    const customerRecord = await this.customersService.findOneByExternalId(
      customer.externalUserId,
      customer.organizationId,
    );

    if (!customerRecord) {
      return {
        feature_key: featureKey,
        has_access: false,
        reason: 'Customer not found',
      };
    }

    // Check feature access
    const access = await this.featuresService.checkAccess(
      customerRecord.id,
      featureKey,
    );

    return {
      feature_key: featureKey,
      has_access: access.has_access,
      limit: access.limit,
      usage: access.usage,
      metadata: access.metadata,
    };
  }

  /**
   * Track usage for a feature
   *
   * @example
   * POST /v1/features/track-usage
   * Headers: Authorization: Bearer bos_session_xxx
   * Body: { feature_key: "api_calls", quantity: 1 }
   */
  @Post('track-usage')
  async trackUsage(
    @CurrentCustomer() customer: CustomerContext,
    @Body() body: {
      feature_key: string;
      quantity: number;
      timestamp?: string;
      metadata?: Record<string, any>;
    },
  ) {
    if (!body.feature_key || !body.quantity) {
      throw new BadRequestException('feature_key and quantity are required');
    }

    // Get customer record
    const customerRecord = await this.customersService.findOneByExternalId(
      customer.externalUserId,
      customer.organizationId,
    );

    if (!customerRecord) {
      throw new BadRequestException('Customer not found');
    }

    // Track usage
    await this.featuresService.trackUsage({
      customer_id: customerRecord.id,
      feature_name: body.feature_key,
      units: body.quantity,
      idempotency_key: body.metadata?.idempotency_key,
    });

    return {
      success: true,
      feature_key: body.feature_key,
      quantity: body.quantity,
      recorded_at: new Date().toISOString(),
    };
  }

  /**
   * List all customer entitlements
   *
   * @example
   * GET /v1/features/entitlements
   * Headers: Authorization: Bearer bos_session_xxx
   */
  @Get('entitlements')
  async getEntitlements(
    @CurrentCustomer() customer: CustomerContext,
  ) {
    // Get customer record
    const customerRecord = await this.customersService.findOneByExternalId(
      customer.externalUserId,
      customer.organizationId,
    );

    if (!customerRecord) {
      return {
        entitlements: [],
      };
    }

    // Get all feature entitlements
    const entitlements = await this.featuresService.getCustomerEntitlements(
      customerRecord.id,
      customer.organizationId,
    );

    return {
      entitlements,
      customer_id: customerRecord.id,
      external_user_id: customer.externalUserId,
    };
  }

  /**
   * Get usage metrics for features
   *
   * @example
   * GET /v1/features/usage-metrics?feature_key=api_calls
   * Headers: Authorization: Bearer bos_session_xxx
   */
  @Get('usage-metrics')
  async getUsageMetrics(
    @CurrentCustomer() customer: CustomerContext,
    @Query('feature_key') featureKey?: string,
  ) {
    // Get customer record
    const customerRecord = await this.customersService.findOneByExternalId(
      customer.externalUserId,
      customer.organizationId,
    );

    if (!customerRecord) {
      return {
        metrics: [],
      };
    }

    // Get usage metrics
    const metrics = await this.featuresService.getUsageMetrics(
      customerRecord.id,
      featureKey,
    );

    return {
      metrics,
      customer_id: customerRecord.id,
      external_user_id: customer.externalUserId,
    };
  }
}