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
  | CreateStripePaymentIntentAction
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

export interface CreateStripePaymentIntentAction {
  kind: 'create_stripe_payment_intent';
  params: Stripe.PaymentIntentCreateParams;
  idempotencyKey: string;
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
  /** Stripe customer ID — needed to list pending invoice items during upgrade */
  stripeCustomerId: string;
  newStripePriceId: string;
  /** BOS checkout session ID — used as Stripe idempotency key + invoice metadata.
   *  Optional because plain swaps don't create an invoice and don't need it. */
  checkoutSessionId?: string;
  /** True when the billing interval changes (e.g. monthly→yearly) — requires billing_cycle_anchor: 'now' */
  intervalChanged: boolean;
  /** True when upgrading from a trialing subscription */
  isTrialUpgrade?: boolean;
  /** Amount to credit to customer balance before ending trial (minor units) */
  trialCreditAmount?: number;
  /** Currency for the trial credit */
  trialCreditCurrency?: string;
  /** Unix timestamp for the new trial end date (trial-to-trial upgrade) */
  newTrialEnd?: number;
  /** True when same-price plan swap: subscriptions.update items only,
   *  proration_behavior: 'none', no invoice generation. */
  isPlainSwap?: boolean;
}

export interface NoStripeAction {
  kind: 'no_stripe_action';
}

// ── Stripe Execution Result ──

export type StripeResult =
  | SubscriptionCreatedResult
  | PaymentIntentOnlyResult
  | CheckoutSessionCreatedResult
  | SetupIntentCreatedResult
  | SubscriptionUpdatedResult
  | SubscriptionUpdateActionRequiredResult
  | NoStripeResult;

export interface SubscriptionCreatedResult {
  kind: 'subscription_created';
  subscription: Stripe.Subscription;
  paymentIntent: Stripe.PaymentIntent;
  clientSecret: string;
  invoiceId: string;
}

export interface PaymentIntentOnlyResult {
  kind: 'payment_intent_only';
  paymentIntent: Stripe.PaymentIntent;
  clientSecret: string;
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
  /** The proration invoice that was created and paid (null when no proration delta) */
  prorationInvoice: Stripe.Invoice | null;
}

/**
 * In-place upgrade where Stripe returned an `open` proration invoice that
 * needs SCA / 3DS authentication. The BOS subscription/entitlement writes are
 * deferred until the `invoice.payment_succeeded` webhook fires.
 */
export interface SubscriptionUpdateActionRequiredResult {
  kind: 'subscription_update_action_required';
  subscription: Stripe.Subscription;
  invoice: Stripe.Invoice;
  hostedInvoiceUrl: string;
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
  checkoutMode:
    | 'standard'
    | 'adaptive'
    | 'free'
    | 'trial'
    | 'upgrade'
    | 'downgrade';
  /** Proration preview (for upgrade mode) */
  proration?: {
    credit: number;
    charge: number;
    netAmount: number;
    currency: string;
  };
  /**
   * True when the upgrade flow stalled at SCA / 3DS. The SDK should open
   * `actionUrl` to let the customer authenticate the proration invoice.
   * BOS will finalize the upgrade via the `invoice.payment_succeeded`
   * webhook.
   */
  requiresAction?: boolean;
  /** Hosted invoice URL the customer must visit to complete the upgrade */
  actionUrl?: string;
  /** Discriminator for the kind of action required */
  actionType?: 'invoice_payment';
  /** Stripe invoice ID associated with the upgrade (proration invoice) */
  stripeInvoiceId?: string;
}
