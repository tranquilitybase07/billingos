/**
 * Phase 1 types: Billing Context
 *
 * BillingContext is the fully-resolved input to the billing pipeline.
 * It contains everything needed to compute a plan — no further DB/Stripe
 * queries are needed after this phase.
 *
 * "Mode" is an emergent property of the context, not an explicit branch.
 */

// ── Organization ──

export interface BillingOrganization {
  id: string;
  stripeAccountId: string;
  defaultCurrency: string;
}

// ── Customer ──

export interface BillingCustomer {
  /** BOS customer ID */
  id: string;
  /** Stripe customer ID on the connected account */
  stripeCustomerId: string;
  /** SDK external user ID */
  externalUserId: string;
  email?: string;
  name?: string;
}

// ── Product & Price ──

export interface BillingProduct {
  id: string;
  name: string;
  description?: string;
  trialDays: number;
  isArchived: boolean;
  features: ProductFeatureSummary[];
}

export interface ProductFeatureSummary {
  title: string;
  properties: Record<string, unknown>;
}

export interface BillingPrice {
  id: string;
  stripePriceId: string;
  amount: number;
  currency: string;
  amountType: 'fixed' | 'free';
  recurringInterval: 'day' | 'week' | 'month' | 'year';
  recurringIntervalCount: number;
}

// ── Transition (existing subscription detection) ──

export type TransitionType = 'upgrade' | 'downgrade' | 'swap';

export interface TransitionContext {
  type: TransitionType;
  oldSubscription: OldSubscriptionInfo;
  /** For downgrades: the old subscription's period end (new sub trials until here) */
  oldPeriodEnd?: Date;
}

export interface OldSubscriptionInfo {
  id: string;
  stripeSubscriptionId: string | null;
  productId: string;
  priceId: string;
  amount: number;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  metadata: Record<string, unknown>;
  recurringInterval: 'day' | 'week' | 'month' | 'year';
}

// ── Discount ──

export interface DiscountContext {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  /** For percentage discounts: the basis points (e.g. 20 = 20%) */
  basisPoints?: number;
  /** For fixed discounts: the amount in minor units */
  amount?: number;
  currency?: string;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number;
  stripeCouponId?: string;
  maxRedemptions?: number;
  redemptionsCount?: number;
}

// ── Billing Context (Phase 1 output) ──

export interface BillingContext {
  organization: BillingOrganization;
  customer: BillingCustomer;
  product: BillingProduct;
  price: BillingPrice;

  /** Detected plan transition (upgrade/downgrade/swap) — null if new subscription */
  transition: TransitionContext | null;

  /** Discount to apply — null if none */
  discount: DiscountContext | null;

  /** Derived flags (emergent from context, not explicit modes) */
  isFreeProduct: boolean;
  isTrialEligible: boolean;
  isAdaptivePricing: boolean;
  /** True when upgrading in-place via subscription.update() */
  isInPlaceUpgrade: boolean;
  /** True when upgrading in-place from a trialing subscription */
  isTrialUpgrade: boolean;
  /** True when trial→trial upgrade: old sub is trialing AND new product has trialDays > 0.
   *  Grants a fresh trial on the new plan instead of ending trial + charging. */
  isTrialToTrialUpgrade: boolean;
  /** True when downgrading in-place via subscription.update() with no proration */
  isInPlaceDowngrade: boolean;
  /** True when trial→trial downgrade: old sub is trialing AND new product has trialDays > 0.
   *  Grants a fresh trial on the new (lower) plan instead of cancel + recreate. */
  isTrialToTrialDowngrade: boolean;
  /** True when same-price plan switch: different product, identical price + interval,
   *  existing Stripe sub. Routes through subscriptions.update() with proration_behavior:'none'
   *  — no card entry, no proration, no destructive cancel + recreate. */
  isInPlaceSwap: boolean;

  /** Caller-provided metadata to pass through to Stripe + BOS records */
  metadata: Record<string, unknown>;

  /** Checkout metadata record ID (for linking to checkout_sessions) */
  checkoutMetadataId?: string;

  /**
   * BOS checkout_sessions row ID, when the pipeline is being executed for an
   * already-persisted preview. Used by the upgrade orchestrator as the
   * idempotency key for the proration invoice and as the metadata pointer the
   * webhooks use to find the session on `invoice.payment_succeeded` /
   * `invoice.payment_failed`.
   */
  existingCheckoutSessionId?: string;
}
