import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { FeatureType } from '../../features/dto/create-feature.dto';
import { Json } from '../../../../../packages/shared/types/database';
import {
  GrantInput,
  RevokeInput,
  SwapInput,
  GrantResult,
  RevokeResult,
  SwapResult,
  GrantedFeature,
  ProductFeatureRow,
} from './entitlement.types';

/**
 * Unified entitlement service for all feature grant/revoke operations.
 *
 * Replaces 4 separate grant implementations and 2 revoke implementations
 * with a single transactional service. All grant operations:
 * - Merge feature.properties with product_feature.config
 * - Create usage_records for USAGE_QUOTA features
 * - Use soft-revoke (revoked_at) — never hard-delete
 *
 * The partial unique index on (subscription_id, feature_id) WHERE revoked_at IS NULL
 * allows re-granting after revocation without constraint violations.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Grant all features from a product to a customer's subscription.
   *
   * Behavior:
   * 1. Fetches product_features joined with features
   * 2. Merges feature.properties + product_feature.config into grant properties
   * 3. Inserts feature_grants (partial unique index prevents duplicates for active grants)
   * 4. Creates usage_records for USAGE_QUOTA features
   *
   * If any insert fails, all grants in this batch are rolled back (transactional via bulk insert).
   */
  async grantForSubscription(input: GrantInput): Promise<GrantResult> {
    const { customerId, subscriptionId, productId, periodStart, periodEnd } =
      input;
    const supabase = this.supabaseService.getClient();

    // Fetch product features with full feature data
    const productFeatures = await this.fetchProductFeatures(productId);
    if (productFeatures.length === 0) {
      return { granted: [], usageRecordsCreated: 0 };
    }

    // Build grant rows with merged properties
    const now = new Date().toISOString();
    const grantRows = productFeatures.map((pf) => ({
      customer_id: customerId,
      subscription_id: subscriptionId,
      feature_id: pf.features!.id,
      granted_at: now,
      revoked_at: null as string | null,
      properties: this.mergeProperties(
        pf.features!.properties,
        pf.config,
      ) as Json,
    }));

    // Bulk insert all grants — if any fails, none are inserted
    const { data: grants, error: grantError } = await supabase
      .from('feature_grants')
      .insert(grantRows)
      .select();

    if (grantError) {
      this.logger.error(
        `Failed to grant features for subscription ${subscriptionId}: ${grantError.message} (code: ${grantError.code})`,
      );
      return { granted: [], usageRecordsCreated: 0 };
    }

    // For usage_records we MUST align with the subscription's authoritative
    // current_period_start/end (the ones Stripe just confirmed and
    // handleSubscriptionUpdated has already mirrored into the BOS subscriptions
    // row). The caller's `periodStart` is `new Date()` from EntitlementPlanner,
    // which on an in-place upgrade is later than the subscription's preserved
    // billing period. Trusting it would create a SECOND usage_record at a
    // different period_start, leaving the original (consumed=quota, limit=old)
    // intact — the next track-usage call would resolve to the old row and fire
    // quota_exceeded.
    let subPeriodStart: string | null = null;
    let subPeriodEnd: string | null = null;
    {
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('current_period_start, current_period_end')
        .eq('id', subscriptionId)
        .single();
      subPeriodStart = subRow?.current_period_start ?? null;
      subPeriodEnd = subRow?.current_period_end ?? null;
    }
    const usagePeriodStart = subPeriodStart ?? periodStart.toISOString();
    const usagePeriodEnd = subPeriodEnd ?? periodEnd.toISOString();

    // Build usage records for USAGE_QUOTA features
    const usageRows = productFeatures
      .filter((pf) => pf.features!.type === FeatureType.USAGE_QUOTA)
      .map((pf) => {
        const merged = this.mergeProperties(pf.features!.properties, pf.config);
        return {
          customer_id: customerId,
          feature_id: pf.features!.id,
          subscription_id: subscriptionId,
          period_start: usagePeriodStart,
          period_end: usagePeriodEnd,
          consumed_units: 0,
          limit_units: (merged as Record<string, number>).limit || 0,
        };
      });

    let usageRecordsCreated = 0;
    if (usageRows.length > 0) {
      // Upsert (not plain insert) so that on plan upgrade — where Stripe
      // preserves current_period_start, making (customer_id, feature_id,
      // period_start) collide with the prior plan's row — we RESET the
      // existing row's consumed_units to 0 and update limit_units to the
      // new plan's value. This is the standard SaaS upgrade behavior:
      // customer paid more, gets fresh quota. A plain INSERT would 23505
      // and the error would be swallowed below, leaving the customer
      // stuck at the old consumed/limit.
      const { error: usageError } = await supabase
        .from('usage_records')
        .upsert(usageRows, {
          onConflict: 'customer_id,feature_id,period_start',
          ignoreDuplicates: false,
        });

      if (usageError) {
        this.logger.error(
          `Failed to upsert usage records for subscription ${subscriptionId}: ${usageError.message}`,
        );
      } else {
        usageRecordsCreated = usageRows.length;
        this.logger.log(
          `Upserted ${usageRecordsCreated} usage records for subscription ${subscriptionId} (resets consumed_units on plan change)`,
        );
      }
    }

    const grantedFeatures = this.mapGrantedFeatures(
      grants || [],
      productFeatures,
    );

    this.logger.log(
      `Granted ${grantedFeatures.length} features for subscription ${subscriptionId} (product ${productId})`,
    );

    return { granted: grantedFeatures, usageRecordsCreated };
  }

  /**
   * Revoke all active feature grants for a subscription.
   * Uses soft-revoke (sets revoked_at) — never hard-deletes.
   */
  async revokeForSubscription(input: RevokeInput): Promise<RevokeResult> {
    const { subscriptionId } = input;
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('feature_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('subscription_id', subscriptionId)
      .is('revoked_at', null)
      .select('id');

    if (error) {
      this.logger.error(
        `Failed to revoke features for subscription ${subscriptionId}: ${error.message}`,
      );
      return { revokedCount: 0 };
    }

    const revokedCount = data?.length ?? 0;
    if (revokedCount > 0) {
      this.logger.log(
        `Revoked ${revokedCount} feature grants for subscription ${subscriptionId}`,
      );
    }

    return { revokedCount };
  }

  /**
   * Swap grants during an in-place upgrade: revoke old → grant new.
   *
   * With the partial unique index, soft-revoke no longer conflicts with
   * re-granting on the same (subscription_id, feature_id), so we never
   * need hard-deletes.
   */
  async swapForSubscription(input: SwapInput): Promise<SwapResult> {
    const { subscriptionId, customerId, newProductId, periodStart, periodEnd } =
      input;

    // Step 1: Soft-revoke all existing active grants
    const revoked = await this.revokeForSubscription({ subscriptionId });

    // Step 2: Grant new product's features
    const granted = await this.grantForSubscription({
      customerId,
      subscriptionId,
      productId: newProductId,
      periodStart,
      periodEnd,
    });

    this.logger.log(
      `Swapped features for subscription ${subscriptionId}: revoked ${revoked.revokedCount}, granted ${granted.granted.length} (new product ${newProductId})`,
    );

    return { revoked, granted };
  }

  /**
   * Ensure grants exist for a subscription — used by adaptive pricing and
   * webhook reconciliation paths. Un-revokes existing grants and inserts
   * any missing ones.
   *
   * This replaces the adaptive-pricing-webhook.service.ts inline logic.
   */
  async ensureGrantsForSubscription(
    customerId: string,
    subscriptionId: string,
    productId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const productFeatures = await this.fetchProductFeatures(productId);
    if (productFeatures.length === 0) return;

    // Un-revoke any previously revoked grants for this subscription
    const { error: unRevokeError } = await supabase
      .from('feature_grants')
      .update({ revoked_at: null, granted_at: new Date().toISOString() })
      .eq('subscription_id', subscriptionId)
      .not('revoked_at', 'is', null);

    if (unRevokeError) {
      this.logger.error(
        `Failed to un-revoke grants for subscription ${subscriptionId}: ${unRevokeError.message}`,
      );
    }

    // Check which features already have grants (active or just un-revoked)
    const { data: existingGrants } = await supabase
      .from('feature_grants')
      .select('feature_id')
      .eq('subscription_id', subscriptionId)
      .is('revoked_at', null);

    const existingFeatureIds = new Set(
      (existingGrants || []).map((g) => g.feature_id),
    );

    // Insert only missing grants
    const now = new Date().toISOString();
    const newGrants = productFeatures
      .filter((pf) => !existingFeatureIds.has(pf.features!.id))
      .map((pf) => ({
        customer_id: customerId,
        subscription_id: subscriptionId,
        feature_id: pf.features!.id,
        properties: this.mergeProperties(
          pf.features!.properties,
          pf.config,
        ) as Json,
        granted_at: now,
      }));

    if (newGrants.length > 0) {
      const { error: grantError } = await supabase
        .from('feature_grants')
        .insert(newGrants);

      if (grantError) {
        this.logger.error(
          `Failed to grant missing features for subscription ${subscriptionId}: ${grantError.message}`,
        );
      } else {
        this.logger.log(
          `Ensured grants for subscription ${subscriptionId}: ${existingFeatureIds.size} existing, ${newGrants.length} new`,
        );
      }
    }

    // Also upsert usage_records for USAGE_QUOTA features. Without this, fresh
    // paid subscriptions (which reach this method via the payment_intent.succeeded
    // webhook → ensureGrantsForSubscription path, NOT through the swap path that
    // calls grantForSubscription) would have feature_grants but no usage_records,
    // so getUsageMetrics either shows nothing or surfaces a stale row from a prior
    // cancelled subscription. Aligns with the subscription's authoritative
    // current_period_start/end so the upsert key matches what trackUsage will
    // look up via track_feature_usage.
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('current_period_start, current_period_end')
      .eq('id', subscriptionId)
      .single();
    const periodStart =
      subRow?.current_period_start ?? new Date().toISOString();
    const periodEnd =
      subRow?.current_period_end ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const usageRows = productFeatures
      .filter((pf) => pf.features!.type === FeatureType.USAGE_QUOTA)
      .map((pf) => {
        const merged = this.mergeProperties(pf.features!.properties, pf.config);
        return {
          customer_id: customerId,
          feature_id: pf.features!.id,
          subscription_id: subscriptionId,
          period_start: periodStart,
          period_end: periodEnd,
          consumed_units: 0,
          limit_units: (merged as Record<string, number>).limit || 0,
        };
      });

    if (usageRows.length > 0) {
      const { error: usageError } = await supabase
        .from('usage_records')
        .upsert(usageRows, {
          onConflict: 'customer_id,feature_id,period_start',
          ignoreDuplicates: false,
        });

      if (usageError) {
        this.logger.error(
          `Failed to upsert usage records for subscription ${subscriptionId}: ${usageError.message}`,
        );
      } else {
        this.logger.log(
          `Upserted ${usageRows.length} usage records for subscription ${subscriptionId} (ensureGrants path)`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchProductFeatures(
    productId: string,
  ): Promise<ProductFeatureRow[]> {
    const supabase = this.supabaseService.getClient();

    const { data: productFeatures, error } = await supabase
      .from('product_features')
      .select(
        `
        feature_id,
        display_order,
        config,
        features (
          id,
          name,
          title,
          type,
          properties
        )
      `,
      )
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch product features for ${productId}: ${error.message}`,
      );
      return [];
    }

    // Filter out entries with missing feature data
    return (productFeatures || []).filter(
      (pf) => pf.features !== null,
    ) as ProductFeatureRow[];
  }

  /**
   * Merge feature-level properties with product-specific config.
   * Product config overrides feature defaults.
   */
  private mergeProperties(
    featureProperties: Record<string, unknown> | null,
    productConfig: Record<string, unknown> | null,
  ): Record<string, unknown> {
    return {
      ...(featureProperties || {}),
      ...(productConfig || {}),
    };
  }

  private mapGrantedFeatures(
    grants: Array<{
      id: string;
      feature_id: string;
      granted_at: string | null;
      revoked_at: string | null;
      properties: Json;
    }>,
    productFeatures: ProductFeatureRow[],
  ): GrantedFeature[] {
    const featureMap = new Map(
      productFeatures.map((pf) => [pf.features!.id, pf.features!]),
    );

    return grants.map((grant) => {
      const feature = featureMap.get(grant.feature_id);
      return {
        id: grant.id,
        feature_id: grant.feature_id,
        name: feature?.name ?? '',
        title: feature?.title ?? '',
        type: feature?.type ?? '',
        granted_at: grant.granted_at,
        revoked_at: grant.revoked_at,
        properties: grant.properties as Record<string, unknown>,
      };
    });
  }
}
