/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { User } from '../user/entities/user.entity';
import { CreateFeatureDto, FeatureType } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { TrackUsageDto } from './dto/track-usage.dto';

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);
  // TODO: Inject Redis client when available
  // private redisClient: Redis;

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Create a new feature
   */
  async create(user: User, createDto: CreateFeatureDto) {
    const supabase = this.supabaseService.getClient();

    // Verify organization exists and user is a member
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', createDto.organization_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Check if feature name already exists for this organization
    const { data: existing } = await supabase
      .from('features')
      .select('id')
      .eq('organization_id', createDto.organization_id)
      .eq('name', createDto.name)
      .single();

    if (existing) {
      throw new BadRequestException(
        `Feature with name "${createDto.name}" already exists`,
      );
    }

    // Create feature
    const { data: feature, error } = await supabase
      .from('features')
      .insert({
        organization_id: createDto.organization_id,
        name: createDto.name,
        title: createDto.title,
        description: createDto.description,
        type: createDto.type,
        properties: createDto.properties || {},
        metadata: createDto.metadata || {},
      })
      .select()
      .single();

    if (error || !feature) {
      this.logger.error('Failed to create feature:', error);
      throw new BadRequestException('Failed to create feature');
    }

    this.logger.log(`Feature created: ${feature.id} (${feature.name})`);

    return feature;
  }

  /**
   * List all features for an organization
   */
  async findAll(organizationId: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify user is member
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const { data: features, error } = await supabase
      .from('features')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch features');
    }

    return features || [];
  }

  /**
   * Get a single feature by ID
   */
  async findOne(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: feature, error } = await supabase
      .from('features')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !feature) {
      throw new NotFoundException('Feature not found');
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', feature.organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You do not have access to this feature');
    }

    return feature;
  }

  /**
   * Update a feature
   */
  async update(id: string, userId: string, updateDto: UpdateFeatureDto) {
    const supabase = this.supabaseService.getClient();

    // Verify feature exists and user has access
    await this.findOne(id, userId);

    const { data: updated, error } = await supabase
      .from('features')
      .update({
        title: updateDto.title,
        description: updateDto.description,
        properties: updateDto.properties,
        metadata: updateDto.metadata,
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      throw new BadRequestException('Failed to update feature');
    }

    this.logger.log(`Feature updated: ${id}`);

    // TODO: Invalidate Redis cache for this feature
    // await this.invalidateFeatureCache(updated.organization_id, updated.name);

    return updated;
  }

  /**
   * Delete a feature
   */
  async remove(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify feature exists and user has access
    const feature = await this.findOne(id, userId);
    console.log(feature);

    // Check if feature is used in any products
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('product_id')
      .eq('feature_id', id)
      .limit(1);

    if (productFeatures && productFeatures.length > 0) {
      throw new BadRequestException(
        'Cannot delete feature that is attached to products',
      );
    }

    const { error } = await supabase.from('features').delete().eq('id', id);

    if (error) {
      throw new BadRequestException('Failed to delete feature');
    }

    this.logger.log(`Feature deleted: ${id}`);

    return { success: true };
  }

  /**
   * Check if a customer has access to a feature
   * This is the SDK endpoint for feature gating
   */
  async checkAccess(customerId: string, featureName: string) {
    const supabase = this.supabaseService.getClient();

    // TODO: Check Redis cache first
    // const cacheKey = `feature:check:${customerId}:${featureName}`;
    // const cached = await this.redisClient.get(cacheKey);
    // if (cached) return JSON.parse(cached);

    // Query database for active feature grants
    const { data: grants, error } = await supabase
      .from('feature_grants')
      .select(
        `
        id,
        granted_at,
        revoked_at,
        properties,
        feature_id,
        subscription_id,
        features (
          id,
          name,
          title,
          type,
          properties
        ),
        subscriptions (
          id,
          status,
          current_period_end
        )
      `,
      )
      .eq('customer_id', customerId)
      .is('revoked_at', null)
      .limit(1);

    if (error) {
      this.logger.error('Error checking feature access:', error);
      throw new BadRequestException('Failed to check feature access');
    }

    // Find the specific feature
    const grant = grants?.find((g: any) => g.features?.name === featureName);

    if (!grant || !grant.features) {
      return {
        has_access: false,
        reason: 'no_active_subscription',
        feature: null,
      };
    }

    // Check subscription status
    if (grant.subscriptions?.status !== 'active') {
      return {
        has_access: false,
        reason: 'subscription_not_active',
        feature: null,
      };
    }

    const feature = grant.features;
    const result: any = {
      has_access: true,
      feature: {
        id: feature.id,
        name: feature.name,
        type: feature.type,
        properties: { ...(feature.properties as any) },
      },
    };

    // If it's a usage quota, fetch current usage
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (feature.type === FeatureType.USAGE_QUOTA) {
      const { data: usageRecord } = await supabase
        .from('usage_records')
        .select('consumed_units, limit_units, period_start, period_end')
        .eq('customer_id', customerId)
        .eq('feature_id', feature.id)
        .eq('subscription_id', grant.subscription_id)
        .gte('period_end', new Date().toISOString())
        .single();

      if (usageRecord) {
        result.feature.properties = {
          ...result.feature.properties,
          limit: usageRecord.limit_units ?? 0,
          consumed: usageRecord.consumed_units ?? 0,
          remaining:
            (usageRecord.limit_units ?? 0) - (usageRecord.consumed_units ?? 0),
          resets_at: usageRecord.period_end,
        };

        // Check if quota exceeded
        if (
          (usageRecord.consumed_units ?? 0) >= (usageRecord.limit_units ?? 0)
        ) {
          result.has_access = false;
          result.reason = 'quota_exceeded';
        }
      }
    }

    // TODO: Cache result in Redis
    // await this.redisClient.setex(cacheKey, 300, JSON.stringify(result)); // 5 min TTL

    return result;
  }

  /**
   * Track usage for a feature
   * Atomically increments usage and enforces limits
   */
  async trackUsage(trackDto: TrackUsageDto) {
    const supabase = this.supabaseService.getClient();

    // TODO: Check idempotency key in Redis
    // if (trackDto.idempotency_key) {
    //   const idempotencyKey = `usage:idempotency:${trackDto.idempotency_key}`;
    //   const existing = await this.redisClient.get(idempotencyKey);
    //   if (existing) return JSON.parse(existing);
    // }

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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (grant.features.type !== FeatureType.USAGE_QUOTA) {
      throw new BadRequestException('Feature is not a usage quota type');
    }

    // Get or create usage record for current period
    const { data: usageRecord, error: fetchError } = await supabase
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

    if (!usageRecord) {
      throw new NotFoundException('Usage record not found for current period');
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

    // TODO: Invalidate Redis cache
    // await this.invalidateFeatureCache(trackDto.customer_id, trackDto.feature_name);

    // TODO: Store idempotency key result
    // if (trackDto.idempotency_key) {
    //   const idempotencyKey = `usage:idempotency:${trackDto.idempotency_key}`;
    //   await this.redisClient.setex(idempotencyKey, 86400, JSON.stringify(result)); // 24h
    // }

    this.logger.log(
      `Usage tracked: ${trackDto.feature_name} for customer ${trackDto.customer_id} - ${trackDto.units} units`,
    );

    return result;
  }

  // TODO: Add Redis cache invalidation methods
  // private async invalidateFeatureCache(customerId: string, featureName: string) {
  //   const cacheKey = `feature:check:${customerId}:${featureName}`;
  //   await this.redisClient.del(cacheKey);
  // }
}
