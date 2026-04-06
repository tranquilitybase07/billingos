/**
 * Unified entitlement types for feature grant/revoke operations.
 *
 * Replaces the inconsistent types scattered across:
 * - subscriptions.service.ts (grant with usage records)
 * - stripe-webhook.service.ts (grant without usage records)
 * - adaptive-pricing-webhook.service.ts (un-revoke + insert missing)
 * - subscription-transition.service.ts (hard-delete)
 */

export interface ProductFeatureRow {
  feature_id: string;
  display_order: number | null;
  config: Record<string, unknown> | null;
  features: {
    id: string;
    name: string;
    title: string;
    type: string;
    properties: Record<string, unknown> | null;
  } | null;
}

/** Input for granting features tied to a subscription */
export interface GrantInput {
  customerId: string;
  subscriptionId: string;
  productId: string;
  /** Required for USAGE_QUOTA features — start of billing period */
  periodStart: Date;
  /** Required for USAGE_QUOTA features — end of billing period */
  periodEnd: Date;
}

/** Input for revoking all active grants on a subscription */
export interface RevokeInput {
  subscriptionId: string;
}

/** Input for swapping grants during in-place upgrades (revoke old + grant new atomically) */
export interface SwapInput {
  /** Subscription whose grants are being replaced */
  subscriptionId: string;
  customerId: string;
  /** New product whose features should be granted */
  newProductId: string;
  periodStart: Date;
  periodEnd: Date;
}

/** A single granted feature returned after granting */
export interface GrantedFeature {
  id: string;
  feature_id: string;
  name: string;
  title: string;
  type: string;
  granted_at: string | null;
  revoked_at: string | null;
  properties: Record<string, unknown>;
}

/** Result of a grant operation */
export interface GrantResult {
  granted: GrantedFeature[];
  usageRecordsCreated: number;
}

/** Result of a revoke operation */
export interface RevokeResult {
  revokedCount: number;
}

/** Result of a swap operation */
export interface SwapResult {
  revoked: RevokeResult;
  granted: GrantResult;
}
