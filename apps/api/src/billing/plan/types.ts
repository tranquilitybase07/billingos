/**
 * Phase 2 types: Billing Plan
 *
 * BillingPlan describes WHAT should happen — it's provider-agnostic.
 * "Create a subscription", "revoke old features, grant new ones",
 * "compute proration" — but no Stripe API params yet.
 *
 * Uses discriminated unions so TypeScript enforces exhaustive handling.
 */

// ── Subscription Actions ──

export type SubscriptionAction =
  | CreateSubscriptionAction
  | UpdateSubscriptionAction
  | ScheduleDowngradeAction
  | FreeActivationAction
  | SetupTrialAction;

export interface CreateSubscriptionAction {
  kind: 'create_subscription';
  /** Stripe price to subscribe to */
  stripePriceId: string;
  /** Amount in minor units */
  amount: number;
  currency: string;
  /** Application fee percentage (platform cut) */
  applicationFeePercent: number;
  /** Metadata to attach to the Stripe subscription */
  stripeMetadata: Record<string, string>;
}

export interface UpdateSubscriptionAction {
  kind: 'update_subscription';
  /** Existing BOS subscription ID to upgrade in-place */
  existingBosSubId: string;
  /** New Stripe price to switch to */
  newStripePriceId: string;
  newAmount: number;
  newProductId: string;
  newPriceId: string;
  /** Proration behavior: 'create_prorations' for upgrades, 'none' for downgrades */
  prorationBehavior?: 'create_prorations' | 'none';
}

export interface ScheduleDowngradeAction {
  kind: 'schedule_downgrade';
  existingBosSubId: string;
  newStripePriceId: string;
  newAmount: number;
  newProductId: string;
  newPriceId: string;
  scheduledFor: Date;
  fromAmount: number;
  fromPriceId: string;
}

export interface FreeActivationAction {
  kind: 'free_activation';
  /** No Stripe objects needed — immediate activation */
}

export interface SetupTrialAction {
  kind: 'setup_trial';
  /** Stripe price for after-trial billing */
  stripePriceId: string;
  trialDays: number;
  amount: number;
  currency: string;
  /** Metadata for the SetupIntent */
  stripeMetadata: Record<string, string>;
}

// ── Transition Actions ──

export type TransitionAction =
  | CancelImmediateAction
  | CancelAtPeriodEndAction
  | NoTransitionAction;

export interface CancelImmediateAction {
  kind: 'cancel_immediate';
  subscriptionId: string;
  stripeSubscriptionId: string | null;
  reason: 'upgraded' | 'plan_swapped' | 'downgraded';
  /** Whether to revoke features immediately */
  revokeFeatures: boolean;
}

export interface CancelAtPeriodEndAction {
  kind: 'cancel_at_period_end';
  subscriptionId: string;
  stripeSubscriptionId: string | null;
  reason: 'downgraded';
  periodEnd: Date;
  /** Features stay active until period end — don't revoke yet */
  revokeFeatures: false;
}

export interface NoTransitionAction {
  kind: 'no_transition';
}

// ── Entitlement Plan ──

export interface EntitlementPlan {
  /** Features to grant for the new subscription */
  grant: {
    productId: string;
    subscriptionId?: string; // Set after subscription creation
    customerId: string;
    periodStart: Date;
    periodEnd: Date;
  } | null;

  /** Features to revoke from the old subscription (if transitioning) */
  revoke: {
    subscriptionId: string;
  } | null;

  /** In-place upgrade: revoke old product features, grant new product features on same sub */
  swap: {
    subscriptionId: string;
    customerId: string;
    newProductId: string;
    periodStart: Date;
    periodEnd: Date;
  } | null;
}

// ── Proration ──

export interface ProrationPreview {
  creditAmount: number;
  newPlanCharge: number;
  proratedAmount: number;
  currency: string;
  immediateCharge: boolean;
}

// ── Discount Plan ──

export interface DiscountPlan {
  couponParams: StripeCouponParams;
}

export interface StripeCouponParams {
  percent_off?: number;
  amount_off?: number;
  currency?: string;
  duration: 'once' | 'repeating' | 'forever';
  duration_in_months?: number;
}

// ── Billing Plan (Phase 2 output) ──

export interface BillingPlan {
  /** Primary action: what kind of subscription operation */
  subscription: SubscriptionAction;

  /** Transition: how to handle the old subscription (if any) */
  transition: TransitionAction;

  /** Entitlement changes to make */
  entitlements: EntitlementPlan;

  /** Proration preview for upgrades */
  proration: ProrationPreview | null;

  /** Discount to apply in Stripe */
  discount: DiscountPlan | null;

  /** Whether adaptive pricing (Stripe Checkout Session) should be used */
  useAdaptivePricing: boolean;

  /** Whether payment is required (false for free/trial) */
  paymentRequired: boolean;
}
