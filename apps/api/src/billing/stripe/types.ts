/**
 * Phase 3 types: Stripe Plan
 *
 * StripePlan is the set of Stripe API calls to execute.
 * Uses discriminated unions — each variant maps to exactly one
 * Stripe API call pattern.
 *
 * Phase 4 (Execute) uses the result to write BOS records.
 */
import Stripe from 'stripe';

// ── Stripe Actions (what to call) ──

export type StripeAction =
  | CreateStripeSubscriptionAction
  | CreateCheckoutSessionAction
  | CreateSetupIntentAction
  | UpdateStripeSubscriptionAction
  | NoStripeAction;

export interface CreateStripeSubscriptionAction {
  kind: 'create_stripe_subscription';
  params: Stripe.SubscriptionCreateParams;
  idempotencyKey: string;
  /** Discounts to include at creation time */
  discounts?: Stripe.SubscriptionCreateParams.Discount[];
}

export interface CreateCheckoutSessionAction {
  kind: 'create_checkout_session';
  params: Stripe.Checkout.SessionCreateParams;
  /** Discounts to include */
  discounts?: Array<{ coupon: string }>;
}

export interface CreateSetupIntentAction {
  kind: 'create_setup_intent';
  params: Stripe.SetupIntentCreateParams;
}

export interface UpdateStripeSubscriptionAction {
  kind: 'update_stripe_subscription';
  stripeSubscriptionId: string;
  newStripePriceId: string;
  prorationBehavior?: 'create_prorations' | 'none';
}

export interface NoStripeAction {
  kind: 'no_stripe_action';
}

// ── Stripe Execution Result ──

export type StripeResult =
  | SubscriptionCreatedResult
  | CheckoutSessionCreatedResult
  | SetupIntentCreatedResult
  | SubscriptionUpdatedResult
  | NoStripeResult;

export interface SubscriptionCreatedResult {
  kind: 'subscription_created';
  subscription: Stripe.Subscription;
  paymentIntent: Stripe.PaymentIntent;
  clientSecret: string;
  invoiceId: string;
}

export interface CheckoutSessionCreatedResult {
  kind: 'checkout_session_created';
  checkoutSession: Stripe.Checkout.Session;
  clientSecret: string;
}

export interface SetupIntentCreatedResult {
  kind: 'setup_intent_created';
  setupIntent: Stripe.SetupIntent;
  clientSecret: string;
}

export interface SubscriptionUpdatedResult {
  kind: 'subscription_updated';
  subscription: Stripe.Subscription;
}

export interface NoStripeResult {
  kind: 'no_stripe_result';
}

// ── Stripe Plan (Phase 3 output) ──

export interface StripePlan {
  /** The Stripe account to execute against */
  stripeAccountId: string;
  /** Primary Stripe action */
  action: StripeAction;
  /** Transition: Stripe subscription to cancel (if any) */
  cancelAction: StripeCancelAction | null;
}

export type StripeCancelAction =
  | StripeCancelImmediateAction
  | StripeCancelAtPeriodEndAction;

export interface StripeCancelImmediateAction {
  kind: 'cancel_immediate';
  stripeSubscriptionId: string;
}

export interface StripeCancelAtPeriodEndAction {
  kind: 'cancel_at_period_end';
  stripeSubscriptionId: string;
}

// ── Pipeline Result (returned to checkout service) ──

export interface PipelineResult {
  /** The Stripe execution result */
  stripeResult: StripeResult;
  /** BOS checkout session ID */
  checkoutSessionId: string;
  /** BOS subscription ID (if created/updated) */
  subscriptionId?: string;
  /** Client secret for frontend (PaymentIntent, SetupIntent, or Checkout Session) */
  clientSecret: string;
  /** Checkout mode for status polling */
  checkoutMode: 'standard' | 'adaptive' | 'free' | 'trial' | 'upgrade' | 'downgrade';
  /** Proration preview (for upgrade mode) */
  proration?: {
    credit: number;
    charge: number;
    netAmount: number;
    currency: string;
  };
}
