/**
 * Webhook event builders for integration tests.
 * Creates realistic Stripe.Event objects to simulate webhook calls.
 *
 * Usage:
 *   const event = buildPaymentIntentSucceededEvent({ ... });
 *   await webhookService.handleEvent(event);
 */
import Stripe from 'stripe';

// ---------- Base Builder ----------

let eventSequence = 0;

function buildBaseEvent(
  type: string,
  data: Record<string, unknown>,
  overrides: Partial<Stripe.Event> = {},
): Stripe.Event {
  eventSequence++;
  return {
    id: overrides.id || `evt_test_${eventSequence}_${Date.now()}`,
    object: 'event',
    api_version: '2025-12-15.clover',
    created: Math.floor(Date.now() / 1000),
    type: type as Stripe.Event.Type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: `req_test_${eventSequence}`, idempotency_key: null },
    data: {
      object: data as Stripe.Event.Data['object'],
    },
    account: overrides.account || undefined,
    ...overrides,
  } as Stripe.Event;
}

// ---------- Payment Intent Events ----------

export function buildPaymentIntentSucceededEvent(opts: {
  paymentIntentId: string;
  amount: number;
  currency?: string;
  customerId?: string;
  invoiceId?: string;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
  eventId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'payment_intent.succeeded',
    {
      id: opts.paymentIntentId,
      object: 'payment_intent',
      amount: opts.amount,
      amount_received: opts.amount,
      currency: opts.currency || 'usd',
      status: 'succeeded',
      customer: opts.customerId || null,
      invoice: opts.invoiceId || null,
      metadata: opts.metadata || {},
      payment_method: 'pm_test_card',
      created: Math.floor(Date.now() / 1000),
    },
    {
      id: opts.eventId,
      account: opts.stripeAccountId,
    },
  );
}

export function buildPaymentIntentFailedEvent(opts: {
  paymentIntentId: string;
  amount: number;
  currency?: string;
  customerId?: string;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'payment_intent.payment_failed',
    {
      id: opts.paymentIntentId,
      object: 'payment_intent',
      amount: opts.amount,
      currency: opts.currency || 'usd',
      status: 'requires_payment_method',
      customer: opts.customerId || null,
      metadata: opts.metadata || {},
      last_payment_error: {
        code: 'card_declined',
        message: 'Your card was declined.',
        type: 'card_error',
      },
      created: Math.floor(Date.now() / 1000),
    },
    { account: opts.stripeAccountId },
  );
}

// ---------- Setup Intent Events ----------

export function buildSetupIntentSucceededEvent(opts: {
  setupIntentId: string;
  customerId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'setup_intent.succeeded',
    {
      id: opts.setupIntentId,
      object: 'setup_intent',
      status: 'succeeded',
      customer: opts.customerId || null,
      payment_method: opts.paymentMethodId || 'pm_test_card',
      metadata: opts.metadata || {},
      created: Math.floor(Date.now() / 1000),
    },
    { account: opts.stripeAccountId },
  );
}

// ---------- Subscription Events ----------

export function buildSubscriptionCreatedEvent(opts: {
  subscriptionId: string;
  customerId: string;
  status?: string;
  priceId?: string;
  productId?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  trialEnd?: number | null;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
}): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return buildBaseEvent(
    'customer.subscription.created',
    {
      id: opts.subscriptionId,
      object: 'subscription',
      customer: opts.customerId,
      status: opts.status || 'active',
      current_period_start: opts.currentPeriodStart || now,
      current_period_end: opts.currentPeriodEnd || now + 30 * 24 * 60 * 60,
      trial_end: opts.trialEnd !== undefined ? opts.trialEnd : null,
      items: {
        data: [
          {
            id: `si_test_${Date.now()}`,
            price: {
              id: opts.priceId || 'price_test',
              product: opts.productId || 'prod_test',
            },
          },
        ],
      },
      metadata: opts.metadata || {},
      cancel_at_period_end: false,
      created: now,
    },
    { account: opts.stripeAccountId },
  );
}

export function buildSubscriptionUpdatedEvent(opts: {
  subscriptionId: string;
  customerId: string;
  status: string;
  previousStatus?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  endedAt?: number | null;
  trialEnd?: number | null;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
}): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  const event = buildBaseEvent(
    'customer.subscription.updated',
    {
      id: opts.subscriptionId,
      object: 'subscription',
      customer: opts.customerId,
      status: opts.status,
      current_period_start: opts.currentPeriodStart || now,
      current_period_end: opts.currentPeriodEnd || now + 30 * 24 * 60 * 60,
      cancel_at_period_end: opts.cancelAtPeriodEnd || false,
      ended_at: opts.endedAt !== undefined ? opts.endedAt : null,
      trial_end: opts.trialEnd !== undefined ? opts.trialEnd : null,
      metadata: opts.metadata || {},
      created: now,
    },
    { account: opts.stripeAccountId },
  );

  // Add previous_attributes if status changed
  if (opts.previousStatus) {
    (event.data as any).previous_attributes = {
      status: opts.previousStatus,
    };
  }

  return event;
}

export function buildSubscriptionDeletedEvent(opts: {
  subscriptionId: string;
  customerId: string;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
}): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return buildBaseEvent(
    'customer.subscription.deleted',
    {
      id: opts.subscriptionId,
      object: 'subscription',
      customer: opts.customerId,
      status: 'canceled',
      ended_at: now,
      current_period_start: now - 30 * 24 * 60 * 60,
      current_period_end: now,
      cancel_at_period_end: false,
      metadata: opts.metadata || {},
      created: now - 30 * 24 * 60 * 60,
    },
    { account: opts.stripeAccountId },
  );
}

// ---------- Invoice Events ----------

export function buildInvoicePaymentSucceededEvent(opts: {
  invoiceId: string;
  subscriptionId: string;
  customerId: string;
  amountPaid: number;
  currency?: string;
  stripeAccountId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'invoice.payment_succeeded',
    {
      id: opts.invoiceId,
      object: 'invoice',
      subscription: opts.subscriptionId,
      customer: opts.customerId,
      amount_paid: opts.amountPaid,
      currency: opts.currency || 'usd',
      status: 'paid',
      paid: true,
      created: Math.floor(Date.now() / 1000),
    },
    { account: opts.stripeAccountId },
  );
}

export function buildInvoicePaymentFailedEvent(opts: {
  invoiceId: string;
  subscriptionId: string;
  customerId: string;
  amountDue: number;
  currency?: string;
  stripeAccountId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'invoice.payment_failed',
    {
      id: opts.invoiceId,
      object: 'invoice',
      subscription: opts.subscriptionId,
      customer: opts.customerId,
      amount_due: opts.amountDue,
      currency: opts.currency || 'usd',
      status: 'open',
      paid: false,
      attempt_count: 1,
      next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
      created: Math.floor(Date.now() / 1000),
    },
    { account: opts.stripeAccountId },
  );
}

// ---------- Charge Events ----------

export function buildChargeRefundedEvent(opts: {
  chargeId: string;
  paymentIntentId: string;
  amount: number;
  amountRefunded: number;
  refundId: string;
  stripeAccountId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'charge.refunded',
    {
      id: opts.chargeId,
      object: 'charge',
      payment_intent: opts.paymentIntentId,
      amount: opts.amount,
      amount_refunded: opts.amountRefunded,
      refunded: opts.amount === opts.amountRefunded,
      refunds: {
        data: [
          {
            id: opts.refundId,
            amount: opts.amountRefunded,
            status: 'succeeded',
          },
        ],
      },
      created: Math.floor(Date.now() / 1000),
    },
    { account: opts.stripeAccountId },
  );
}

// ---------- Account Events ----------

export function buildAccountUpdatedEvent(opts: {
  accountId: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
}): Stripe.Event {
  return buildBaseEvent('account.updated', {
    id: opts.accountId,
    object: 'account',
    charges_enabled: opts.chargesEnabled ?? true,
    payouts_enabled: opts.payoutsEnabled ?? true,
    details_submitted: opts.detailsSubmitted ?? true,
    business_type: 'individual',
    email: 'test@example.com',
    country: 'US',
    default_currency: 'usd',
  });
}

// ---------- Checkout Session Events ----------

export function buildCheckoutSessionCompletedEvent(opts: {
  sessionId: string;
  subscriptionId?: string;
  customerId: string;
  paymentIntentId?: string;
  metadata?: Record<string, string>;
  stripeAccountId?: string;
}): Stripe.Event {
  return buildBaseEvent(
    'checkout.session.completed',
    {
      id: opts.sessionId,
      object: 'checkout.session',
      customer: opts.customerId,
      subscription: opts.subscriptionId || null,
      payment_intent: opts.paymentIntentId || null,
      mode: 'subscription',
      payment_status: 'paid',
      status: 'complete',
      metadata: opts.metadata || {},
      created: Math.floor(Date.now() / 1000),
    },
    { account: opts.stripeAccountId },
  );
}

// ---------- Reset ----------

export function resetEventSequence(): void {
  eventSequence = 0;
}
