import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../supabase/supabase.service';
import { FeatureType } from '../../features/dto/create-feature.dto';
import { TrackUsageDto } from '../../features/dto/track-usage.dto';

/**
 * Handles all usage tracking and metering operations.
 *
 * Extracted from FeaturesService to consolidate usage-related logic
 * alongside the EntitlementService in the billing/entitlements module.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Track usage for a feature.
   * Atomically increments usage and enforces limits.
   */
  async trackUsage(trackDto: TrackUsageDto) {
    const supabase = this.supabaseService.getClient();

    // Check idempotency key in database
    if (trackDto.idempotency_key) {
      const { data: existingKey } = await (supabase as any)
        .from('idempotency_keys')
        .select('response, expires_at')
        .eq('customer_id', trackDto.customer_id)
        .eq('idempotency_key', trackDto.idempotency_key)
        .single();

      if (existingKey && new Date(existingKey.expires_at) > new Date()) {
        this.logger.log(`Idempotency key hit: ${trackDto.idempotency_key}`);
        return existingKey.response;
      }
    }

    // Get active subscription with the feature
    const { data: grants } = await supabase
      .from('feature_grants')
      .select(
        `
        id,
        subscription_id,
        feature_id,
        features (
          id,
          name,
          type,
          properties
        ),
        subscriptions (
          id,
          status,
          current_period_start,
          current_period_end
        )
      `,
      )
      .eq('customer_id', trackDto.customer_id)
      .is('revoked_at', null);

    const grant = grants?.find(
      (g: any) => g.features?.name === trackDto.feature_name,
    );

    if (!grant || !grant.features) {
      throw new NotFoundException('No active subscription with this feature');
    }

    // Block usage on canceled/expired subscriptions
    const subStatus = (grant as any).subscriptions?.status;
    if (subStatus && !['active', 'trialing', 'past_due'].includes(subStatus)) {
      throw new BadRequestException('subscription_inactive', {
        cause: {
          error: 'subscription_inactive',
          message: `Subscription is ${subStatus} — usage tracking is not allowed`,
        },
      });
    }

    if (grant.features.type !== FeatureType.USAGE_QUOTA) {
      throw new BadRequestException('Feature is not a usage quota type');
    }

    // Get or create usage record for current period
    const { data: existingRecord, error: fetchError } = await supabase
      .from('usage_records')
      .select('*')
      .eq('customer_id', trackDto.customer_id)
      .eq('feature_id', grant.feature_id)
      .eq('subscription_id', grant.subscription_id)
      .gte('period_end', new Date().toISOString())
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = not found
      this.logger.error('Error fetching usage record:', fetchError);
      throw new BadRequestException('Failed to fetch usage record');
    }

    let usageRecord = existingRecord;

    if (!usageRecord) {
      // Auto-create usage record for the current billing period
      const periodStart =
        (grant as any).subscriptions?.current_period_start ||
        new Date().toISOString();
      const periodEnd =
        (grant as any).subscriptions?.current_period_end ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const featureProperties = grant.features.properties as any;
      const limitUnits = featureProperties?.limit ?? 0;

      const { data: newRecord, error: createError } = await supabase
        .from('usage_records')
        .insert({
          customer_id: trackDto.customer_id,
          feature_id: grant.feature_id,
          subscription_id: grant.subscription_id,
          consumed_units: 0,
          limit_units: limitUnits,
          period_start: periodStart,
          period_end: periodEnd,
        })
        .select()
        .single();

      if (createError || !newRecord) {
        this.logger.error('Failed to auto-create usage record:', createError);
        throw new BadRequestException('Failed to create usage record');
      }

      usageRecord = newRecord;
      this.logger.log(
        `Auto-created usage record for customer ${trackDto.customer_id}, feature ${trackDto.feature_name}`,
      );
    }

    // Check if adding units would exceed limit
    const newConsumed = Number(usageRecord.consumed_units) + trackDto.units;
    if (newConsumed > Number(usageRecord.limit_units)) {
      throw new BadRequestException('quota_exceeded', {
        cause: {
          error: 'quota_exceeded',
          message: `Usage limit reached for ${trackDto.feature_name}`,
          details: {
            feature: {
              name: grant.features.name,
              type: grant.features.type,
            },
            usage: {
              consumed_units: usageRecord.consumed_units,
              limit_units: usageRecord.limit_units,
              remaining_units: 0,
              resets_at: usageRecord.period_end,
            },
          },
        },
      });
    }

    // Atomically increment usage
    const { data: updated, error: updateError } = await supabase
      .from('usage_records')
      .update({
        consumed_units: newConsumed,
      })
      .eq('id', usageRecord.id)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error('Failed to update usage record:', updateError);
      throw new BadRequestException('Failed to track usage');
    }

    const result = {
      success: true,
      feature: {
        name: grant.features.name,
        type: grant.features.type,
      },
      usage: {
        consumed_units: updated.consumed_units,
        limit_units: updated.limit_units,
        remaining_units:
          Number(updated.limit_units) - Number(updated.consumed_units),
        period_start: updated.period_start,
        period_end: updated.period_end,
      },
    };

    // Store idempotency key result
    if (trackDto.idempotency_key) {
      await (supabase as any).from('idempotency_keys').upsert(
        {
          customer_id: trackDto.customer_id,
          idempotency_key: trackDto.idempotency_key,
          response: result,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'customer_id,idempotency_key' },
      );
    }

    this.logger.log(
      `Usage tracked: ${trackDto.feature_name} for customer ${trackDto.customer_id} - ${trackDto.units} units`,
    );

    return result;
  }

  /**
   * Get usage metrics for a customer's features.
   * Shows current consumption vs limits.
   */
  async getUsageMetrics(customerId: string, featureName?: string) {
    const supabase = this.supabaseService.getClient();

    // Build query for usage records
    let query = supabase
      .from('usage_records')
      .select(
        `
        id,
        consumed_units,
        limit_units,
        period_start,
        period_end,
        features (
          id,
          name,
          title,
          type
        ),
        subscriptions (
          id,
          status,
          products (
            name
          )
        )
      `,
      )
      .eq('customer_id', customerId)
      .gte('period_end', new Date().toISOString());

    // If specific feature requested, filter by it
    if (featureName) {
      const { data: feature } = await supabase
        .from('features')
        .select('id')
        .eq('name', featureName)
        .single();

      if (feature) {
        query = query.eq('feature_id', feature.id);
      }
    }

    const { data: records, error } = await query;

    if (error) {
      this.logger.error('Error fetching usage metrics:', error);
      throw new BadRequestException('Failed to fetch usage metrics');
    }

    // Transform into metrics format
    const metrics = (records || []).map((record: any) => ({
      feature_key: record.features?.name,
      feature_title: record.features?.title,
      product_name: record.subscriptions?.products?.name,
      consumed: record.consumed_units || 0,
      limit: record.limit_units || 0,
      remaining: Math.max(
        0,
        (record.limit_units || 0) - (record.consumed_units || 0),
      ),
      percentage_used:
        record.limit_units > 0
          ? Math.round(
              ((record.consumed_units || 0) / record.limit_units) * 100,
            )
          : 0,
      period_start: record.period_start,
      period_end: record.period_end,
      resets_in_days: Math.ceil(
        (new Date(record.period_end).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    }));

    return metrics;
  }

  /**
   * Clean up expired idempotency keys every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredIdempotencyKeys() {
    const supabase = this.supabaseService.getClient();

    const { error } = await (supabase as any)
      .from('idempotency_keys')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      this.logger.error('Failed to cleanup expired idempotency keys:', error);
    } else {
      this.logger.log('Cleaned up expired idempotency keys');
    }
  }
}
