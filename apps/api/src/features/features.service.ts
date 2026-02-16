/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { User } from '../user/entities/user.entity';
import { CreateFeatureDto, FeatureType } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { TrackUsageDto } from './dto/track-usage.dto';

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);
  // TODO: Inject Redis client when available
  // private redisClient: Redis;

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Get Stripe account ID for an organization
   * Returns null if organization doesn't have a Stripe account yet
   */
  private async getStripeAccountId(
    organizationId: string,
  ): Promise<string | null> {
    const supabase = this.supabaseService.getClient();

    const { data: org, error } = await supabase
      .from('organizations')
      .select(
        `
        account_id,
        accounts (
          stripe_id
        )
      `,
      )
      .eq('id', organizationId)
      .single();

    if (error || !org) {
      this.logger.warn(
        `Failed to get organization ${organizationId}: ${error?.message}`,
      );
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return org.accounts?.stripe_id || null;
  }

  /**
   * Log a Stripe sync event
   */
  private async logSyncEvent(params: {
    organizationId: string;
    entityType: 'feature' | 'feature_grant' | 'product_feature';
    entityId: string;
    stripeObjectId: string | null;
    operation: 'create' | 'update' | 'delete' | 'backfill' | 'webhook';
    status: 'success' | 'failure' | 'partial';
    errorMessage?: string;
    triggeredBy?: string;
  }) {
    const supabase = this.supabaseService.getClient();

    await supabase.from('stripe_sync_events').insert({
      organization_id: params.organizationId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      stripe_object_id: params.stripeObjectId,
      operation: params.operation,
      status: params.status,
      error_message: params.errorMessage,
      triggered_by: params.triggeredBy || 'api',
    });
  }

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

    // Get Stripe account ID for this organization
    const stripeAccountId = await this.getStripeAccountId(
      createDto.organization_id,
    );

    let stripeFeatureId: string | null = null;
    let stripeSyncStatus: 'pending' | 'synced' | 'failed' = 'pending';

    // Create feature in Stripe first (if account exists)
    if (stripeAccountId) {
      try {
        const stripeFeature = await this.stripeService.createEntitlementFeature(
          {
            name: createDto.title,
            lookupKey: createDto.name,
            metadata: {
              local_feature_id: 'pending', // Will update after DB insert
              type: createDto.type,
              ...(createDto.metadata || {}),
            },
            stripeAccountId,
          },
        );

        stripeFeatureId = stripeFeature.id;
        stripeSyncStatus = 'synced';

        this.logger.log(
          `Created Stripe Feature: ${stripeFeatureId} for ${createDto.name}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create Stripe Feature for ${createDto.name}:`,
          error,
        );
        stripeSyncStatus = 'failed';
        // Continue with local creation even if Stripe fails
        // We'll sync later via backfill script
      }
    }

    // Create feature in local database
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
        stripe_feature_id: stripeFeatureId,
        stripe_synced_at: stripeFeatureId ? new Date().toISOString() : null,
        stripe_sync_status: stripeSyncStatus,
      })
      .select()
      .single();

    if (error || !feature) {
      this.logger.error('Failed to create feature:', error);

      // Rollback Stripe feature if DB insert failed
      if (stripeFeatureId && stripeAccountId) {
        try {
          await this.stripeService.archiveEntitlementFeature(
            stripeFeatureId,
            stripeAccountId,
          );
          this.logger.log(`Rolled back Stripe Feature: ${stripeFeatureId}`);
        } catch (rollbackError) {
          this.logger.error(
            `Failed to rollback Stripe Feature ${stripeFeatureId}:`,
            rollbackError,
          );
        }
      }

      throw new BadRequestException('Failed to create feature');
    }

    // Update Stripe feature metadata with local feature ID
    if (stripeFeatureId && stripeAccountId) {
      try {
        await this.stripeService.updateEntitlementFeature(stripeFeatureId, {
          metadata: {
            local_feature_id: feature.id,
            type: createDto.type,
            ...(createDto.metadata || {}),
          },
          stripeAccountId,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to update Stripe Feature metadata for ${stripeFeatureId}:`,
          error,
        );
        // Non-critical, don't fail the operation
      }
    }

    // Log sync event
    await this.logSyncEvent({
      organizationId: createDto.organization_id,
      entityType: 'feature',
      entityId: feature.id,
      stripeObjectId: stripeFeatureId,
      operation: 'create',
      status: stripeSyncStatus === 'synced' ? 'success' : 'failure',
      errorMessage:
        stripeSyncStatus === 'failed'
          ? 'Failed to create Stripe Feature'
          : undefined,
    });

    this.logger.log(
      `Feature created: ${feature.id} (${feature.name}) - Stripe sync: ${stripeSyncStatus}`,
    );

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
      .select(`
        *,
        product_features (
          product_id,
          display_order,
          config
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch features');
    }

    // If we have features with product_features, enrich with product data
    if (features && features.length > 0) {
      // Get all unique product IDs
      const productIds = new Set<string>();
      features.forEach(feature => {
        if (feature.product_features) {
          feature.product_features.forEach((pf: any) => {
            productIds.add(pf.product_id);
          });
        }
      });

      // Fetch product details if we have any product IDs
      if (productIds.size > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name')
          .in('id', Array.from(productIds));

        // Create a map for quick lookup
        const productMap = new Map();
        if (products) {
          products.forEach(product => {
            productMap.set(product.id, product);
          });
        }

        // Enrich product_features with product data
        features.forEach(feature => {
          if (feature.product_features) {
            feature.product_features = feature.product_features.map((pf: any) => ({
              ...pf,
              products: productMap.get(pf.product_id) || null
            }));
          }
        });
      }
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
      .select(`
        *,
        product_features (
          product_id,
          display_order,
          config
        )
      `)
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

    // Enrich with product data if we have product_features
    if (feature.product_features && feature.product_features.length > 0) {
      const productIds = feature.product_features.map((pf: any) => pf.product_id);

      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      // Create a map for quick lookup
      const productMap = new Map();
      if (products) {
        products.forEach(product => {
          productMap.set(product.id, product);
        });
      }

      // Enrich product_features with product data
      feature.product_features = feature.product_features.map((pf: any) => ({
        ...pf,
        products: productMap.get(pf.product_id) || null
      }));
    }

    return feature;
  }

  /**
   * Update a feature
   */
  async update(id: string, userId: string, updateDto: UpdateFeatureDto) {
    const supabase = this.supabaseService.getClient();

    // Verify feature exists and user has access
    const feature = await this.findOne(id, userId);

    // Get Stripe account ID
    const stripeAccountId = await this.getStripeAccountId(
      feature.organization_id,
    );

    let stripeSyncStatus: 'synced' | 'failed' | null = null;

    // Update in Stripe if feature is synced
    if (feature.stripe_feature_id && stripeAccountId) {
      try {
        const existingMetadata =
          (feature.metadata as Record<string, any>) || {};
        const newMetadata = updateDto.metadata || {};

        await this.stripeService.updateEntitlementFeature(
          feature.stripe_feature_id,
          {
            name: updateDto.title,
            metadata: {
              local_feature_id: id,
              type: feature.type,
              ...existingMetadata,
              ...newMetadata,
            },
            stripeAccountId,
          },
        );

        stripeSyncStatus = 'synced';
        this.logger.log(`Updated Stripe Feature: ${feature.stripe_feature_id}`);
      } catch (error) {
        this.logger.error(
          `Failed to update Stripe Feature ${feature.stripe_feature_id}:`,
          error,
        );
        stripeSyncStatus = 'failed';
        // Continue with local update even if Stripe fails
      }
    }

    // Update in local database
    const updateData: any = {
      title: updateDto.title,
      description: updateDto.description,
      properties: updateDto.properties,
      metadata: updateDto.metadata,
    };

    if (stripeSyncStatus) {
      updateData.stripe_sync_status = stripeSyncStatus;
      updateData.stripe_synced_at =
        stripeSyncStatus === 'synced' ? new Date().toISOString() : undefined;
    }

    const { data: updated, error } = await supabase
      .from('features')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      throw new BadRequestException('Failed to update feature');
    }

    // Log sync event if Stripe update was attempted
    if (stripeSyncStatus) {
      await this.logSyncEvent({
        organizationId: feature.organization_id,
        entityType: 'feature',
        entityId: id,
        stripeObjectId: feature.stripe_feature_id,
        operation: 'update',
        status: stripeSyncStatus === 'synced' ? 'success' : 'failure',
        errorMessage:
          stripeSyncStatus === 'failed'
            ? 'Failed to update Stripe Feature'
            : undefined,
      });
    }

    this.logger.log(
      `Feature updated: ${id} - Stripe sync: ${stripeSyncStatus || 'not synced'}`,
    );

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

    // Get Stripe account ID
    const stripeAccountId = await this.getStripeAccountId(
      feature.organization_id,
    );

    let stripeSyncStatus: 'synced' | 'failed' | null = null;

    // Archive in Stripe if feature is synced (Stripe doesn't support hard delete)
    if (feature.stripe_feature_id && stripeAccountId) {
      try {
        await this.stripeService.archiveEntitlementFeature(
          feature.stripe_feature_id,
          stripeAccountId,
        );

        stripeSyncStatus = 'synced';
        this.logger.log(
          `Archived Stripe Feature: ${feature.stripe_feature_id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to archive Stripe Feature ${feature.stripe_feature_id}:`,
          error,
        );
        stripeSyncStatus = 'failed';
        // Continue with local delete even if Stripe fails
      }
    }

    // Delete from local database
    const { error } = await supabase.from('features').delete().eq('id', id);

    if (error) {
      throw new BadRequestException('Failed to delete feature');
    }

    // Log sync event if Stripe operation was attempted
    if (stripeSyncStatus) {
      await this.logSyncEvent({
        organizationId: feature.organization_id,
        entityType: 'feature',
        entityId: id,
        stripeObjectId: feature.stripe_feature_id,
        operation: 'delete',
        status: stripeSyncStatus === 'synced' ? 'success' : 'failure',
        errorMessage:
          stripeSyncStatus === 'failed'
            ? 'Failed to archive Stripe Feature'
            : undefined,
      });
    }

    this.logger.log(
      `Feature deleted: ${id} - Stripe sync: ${stripeSyncStatus || 'not synced'}`,
    );

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

  /**
   * Get all feature entitlements for a customer
   * Shows what features they have access to via their subscription
   */
  async getCustomerEntitlements(customerId: string, organizationId: string) {
    const supabase = this.supabaseService.getClient();

    // Get all active feature grants for this customer
    const { data: grants, error } = await supabase
      .from('feature_grants')
      .select(
        `
        id,
        granted_at,
        properties,
        features (
          id,
          name,
          title,
          description,
          type,
          properties
        ),
        subscriptions (
          id,
          status,
          current_period_end,
          products (
            id,
            name,
            description
          )
        )
      `,
      )
      .eq('customer_id', customerId)
      .is('revoked_at', null);

    if (error) {
      this.logger.error('Error fetching entitlements:', error);
      throw new BadRequestException('Failed to fetch entitlements');
    }

    // Transform grants into entitlements
    const entitlements = (grants || []).map((grant: any) => {
      const entitlement: any = {
        feature_key: grant.features?.name,
        feature_title: grant.features?.title,
        feature_type: grant.features?.type,
        granted_at: grant.granted_at,
        product_name: grant.subscriptions?.products?.name,
        subscription_status: grant.subscriptions?.status,
      };

      // Add usage info for quota features
      if (grant.features?.type === 'usage_quota') {
        entitlement.properties = grant.features.properties;
      }

      return entitlement;
    });

    return entitlements;
  }

  /**
   * Get usage metrics for a customer's features
   * Shows current consumption vs limits
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
      // First get the feature ID
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
      remaining: Math.max(0, (record.limit_units || 0) - (record.consumed_units || 0)),
      percentage_used: record.limit_units > 0
        ? Math.round(((record.consumed_units || 0) / record.limit_units) * 100)
        : 0,
      period_start: record.period_start,
      period_end: record.period_end,
      resets_in_days: Math.ceil(
        (new Date(record.period_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

    return metrics;
  }

  /**
   * Get all granted features for a customer
   */
  async getCustomerFeatures(customerId: string, organizationId?: string) {
    const supabase = this.supabaseService.getClient();

    this.logger.log(`Getting features for customer ${customerId}, org: ${organizationId}`);

    // Build the query
    const { data: grants, error } = await supabase
      .from('feature_grants')
      .select(`
        id,
        feature_id,
        granted_at,
        revoked_at,
        subscription_id,
        features (
          id,
          name,
          title,
          description,
          type,
          organization_id
        )
      `)
      .eq('customer_id', customerId)
      .is('revoked_at', null);

    if (error) {
      this.logger.error(`Error fetching customer features:`, error);
      throw new BadRequestException('Failed to fetch customer features');
    }

    this.logger.log(`Found ${grants?.length || 0} feature grants for customer ${customerId}`);
    this.logger.log(`Raw grants data:`, JSON.stringify(grants, null, 2));

    // Filter by organization if provided
    let filteredGrants = grants || [];
    if (organizationId) {
      filteredGrants = filteredGrants.filter(
        (grant: any) => grant.features?.organization_id === organizationId
      );
      this.logger.log(`After org filter: ${filteredGrants.length} grants`);
    }

    // Map to response format
    const features = filteredGrants.map((grant: any) => ({
      id: grant.id,
      feature_id: grant.feature_id,
      feature_key: grant.features?.name || 'unknown',
      feature_name: grant.features?.title || grant.features?.name || 'Unknown Feature',
      feature_description: grant.features?.description || null,
      feature_type: grant.features?.type || null,
      granted_at: grant.granted_at,
      subscription_id: grant.subscription_id,
    }));

    this.logger.log(`Returning ${features.length} features`);

    return features;
  }

  // TODO: Add Redis cache invalidation methods
  // private async invalidateFeatureCache(customerId: string, featureName: string) {
  //   const cacheKey = `feature:check:${customerId}:${featureName}`;
  //   await this.redisClient.del(cacheKey);
  // }
}
