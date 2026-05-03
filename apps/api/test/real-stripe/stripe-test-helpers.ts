/**
 * Helpers for real-Stripe-test-mode integration tests.
 *
 * Wraps `stripe.testHelpers.testClocks.*` and the Stripe-blessed test
 * payment-method tokens so individual specs stay short. Modeled on
 * Autumn's pattern — see `~/Code/autumn/server/tests/utils/stripeUtils.ts`.
 */
import type Stripe from 'stripe';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function addMonths(date: Date, n: number): Date {
  const r = new Date(date);
  r.setMonth(r.getMonth() + n);
  return r;
}

/**
 * Stripe-blessed test PMs. Stripe processes these deterministically:
 * `tok_visa` → success, `pm_card_chargeCustomerFail` → declines on charge,
 * `pm_card_authenticationRequired` → 3DS challenge.
 */
export const TestCard = {
  success: 'tok_visa',
  fail: 'pm_card_chargeCustomerFail',
  authRequired: 'pm_card_authenticationRequired',
} as const;

export type TestCardKind = keyof typeof TestCard;

/**
 * After advancing a test clock, Stripe takes ~10-20s to process the
 * advance: generate invoices, attempt charges, fire webhooks. Tests must
 * wait for that work to finish before asserting state.
 */
const DEFAULT_CLOCK_WAIT_MS = 20_000;

export interface AdvanceClockOpts {
  stripe: Stripe;
  testClockId: string;
  /** Required when the clock lives on a Connect account (always, in our tests). */
  stripeAccountId?: string;
  startingFrom?: Date;
  numberOfDays?: number;
  numberOfWeeks?: number;
  numberOfHours?: number;
  numberOfMonths?: number;
  advanceTo?: number;
  waitForWebhooksMs?: number;
}

export async function advanceTestClock(
  opts: AdvanceClockOpts,
): Promise<number> {
  const start = opts.startingFrom ?? new Date();
  let target = start;
  if (opts.numberOfMonths) target = addMonths(target, opts.numberOfMonths);
  if (opts.numberOfWeeks)
    target = new Date(target.getTime() + opts.numberOfWeeks * MS_PER_WEEK);
  if (opts.numberOfDays)
    target = new Date(target.getTime() + opts.numberOfDays * MS_PER_DAY);
  if (opts.numberOfHours)
    target = new Date(target.getTime() + opts.numberOfHours * MS_PER_HOUR);

  const advanceTo =
    opts.numberOfMonths ||
    opts.numberOfWeeks ||
    opts.numberOfDays ||
    opts.numberOfHours
      ? target.getTime()
      : (opts.advanceTo ?? addMonths(start, 1).getTime());

  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;
  await opts.stripe.testHelpers.testClocks.advance(
    opts.testClockId,
    { frozen_time: Math.floor(advanceTo / 1000) },
    reqOpts,
  );

  await wait(opts.waitForWebhooksMs ?? DEFAULT_CLOCK_WAIT_MS);
  return advanceTo;
}

export interface CreateTestClockedCustomerOpts {
  stripe: Stripe;
  email: string;
  name?: string;
  frozenTime?: Date;
  /** Provided Stripe Connect account — required for platform-mode tests. */
  stripeAccountId?: string;
  /** When set, attach the test PM after customer creation. */
  paymentMethod?: TestCardKind;
}

export interface TestClockedCustomer {
  stripeCustomerId: string;
  testClockId: string;
}

export async function createTestClockedCustomer(
  opts: CreateTestClockedCustomerOpts,
): Promise<TestClockedCustomer> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;

  const clock = await opts.stripe.testHelpers.testClocks.create(
    {
      frozen_time: Math.floor((opts.frozenTime ?? new Date()).getTime() / 1000),
    },
    reqOpts,
  );

  const customer = await opts.stripe.customers.create(
    {
      email: opts.email,
      name: opts.name,
      test_clock: clock.id,
    },
    reqOpts,
  );

  if (opts.paymentMethod) {
    await attachTestPaymentMethod({
      stripe: opts.stripe,
      stripeCustomerId: customer.id,
      kind: opts.paymentMethod,
      stripeAccountId: opts.stripeAccountId,
    });
  }

  return { stripeCustomerId: customer.id, testClockId: clock.id };
}

export interface AttachTestPmOpts {
  stripe: Stripe;
  stripeCustomerId: string;
  kind: TestCardKind;
  stripeAccountId?: string;
}

export async function attachTestPaymentMethod(
  opts: AttachTestPmOpts,
): Promise<string> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;

  let pmIdToAttach: string;
  if (opts.kind === 'success') {
    const pm = await opts.stripe.paymentMethods.create(
      { type: 'card', card: { token: TestCard.success } },
      reqOpts,
    );
    pmIdToAttach = pm.id;
  } else {
    // Stripe-blessed test PMs (e.g. pm_card_chargeCustomerFail) are global
    // templates; attaching clones them onto the customer with a new id.
    pmIdToAttach = TestCard[opts.kind];
  }

  await opts.stripe.paymentMethods.attach(
    pmIdToAttach,
    { customer: opts.stripeCustomerId },
    reqOpts,
  );

  // For template-based attaches the customer's PM has a different id than the
  // template — re-list and use whatever Stripe actually attached.
  const list = await opts.stripe.paymentMethods.list(
    { customer: opts.stripeCustomerId, type: 'card', limit: 5 },
    reqOpts,
  );
  const attachedId = list.data[0]?.id ?? pmIdToAttach;

  await opts.stripe.customers.update(
    opts.stripeCustomerId,
    { invoice_settings: { default_payment_method: attachedId } },
    reqOpts,
  );
  return attachedId;
}

export interface CleanupCustomerOpts {
  stripe: Stripe;
  stripeCustomerId?: string;
  testClockId?: string;
  stripeAccountId?: string;
}

/**
 * Best-effort teardown. Test clocks must be deleted before their customer
 * (Stripe rejects the customer delete otherwise).
 */
export async function cleanupTestStripeArtifacts(
  opts: CleanupCustomerOpts,
): Promise<void> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;

  if (opts.testClockId) {
    try {
      await opts.stripe.testHelpers.testClocks.del(opts.testClockId, reqOpts);
    } catch {
      // Already gone or never created — fine.
    }
  }
  if (opts.stripeCustomerId) {
    try {
      await opts.stripe.customers.del(opts.stripeCustomerId, reqOpts);
    } catch {
      // Same.
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Confirm helpers ──

/**
 * After Stripe.js would normally confirm a PI on the frontend, we do the
 * same server-side using a test PM. `setupFutureUsage` matters for
 * subscriptions: the resulting PM must be saved on the customer for the
 * next renewal to charge automatically.
 */
export async function confirmTestPaymentIntent(opts: {
  stripe: Stripe;
  paymentIntentId: string;
  paymentMethod?: TestCardKind;
  stripeAccountId?: string;
}): Promise<Stripe.PaymentIntent> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;
  const kind = opts.paymentMethod ?? 'success';
  const pmId =
    kind === 'success'
      ? (
          await opts.stripe.paymentMethods.create(
            { type: 'card', card: { token: TestCard.success } },
            reqOpts,
          )
        ).id
      : TestCard[kind];
  return opts.stripe.paymentIntents.confirm(
    opts.paymentIntentId,
    { payment_method: pmId, return_url: 'https://test.billingos.dev/return' },
    reqOpts,
  );
}

export async function confirmTestSetupIntent(opts: {
  stripe: Stripe;
  setupIntentId: string;
  paymentMethod?: TestCardKind;
  stripeAccountId?: string;
}): Promise<Stripe.SetupIntent> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;
  const kind = opts.paymentMethod ?? 'success';
  const pmId =
    kind === 'success'
      ? (
          await opts.stripe.paymentMethods.create(
            { type: 'card', card: { token: TestCard.success } },
            reqOpts,
          )
        ).id
      : TestCard[kind];
  return opts.stripe.setupIntents.confirm(
    opts.setupIntentId,
    { payment_method: pmId, return_url: 'https://test.billingos.dev/return' },
    reqOpts,
  );
}

/**
 * Replace the customer's default invoice PM. Used to flip a healthy
 * subscription into a failure state (or vice versa) before advancing the
 * test clock to the next renewal.
 */
export async function swapStripePaymentMethod(opts: {
  stripe: Stripe;
  stripeCustomerId: string;
  kind: TestCardKind;
  stripeAccountId?: string;
}): Promise<string> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;
  // Detach existing PMs first so the swap is clean.
  const existing = await opts.stripe.paymentMethods.list(
    { customer: opts.stripeCustomerId, type: 'card' },
    reqOpts,
  );
  for (const pm of existing.data) {
    try {
      await opts.stripe.paymentMethods.detach(pm.id, reqOpts);
    } catch {
      // ignore
    }
  }
  return attachTestPaymentMethod({
    stripe: opts.stripe,
    stripeCustomerId: opts.stripeCustomerId,
    kind: opts.kind,
    stripeAccountId: opts.stripeAccountId,
  });
}

/**
 * Trigger Stripe's retry of the most-recent open invoice for a sub.
 * Used by the past_due → recovered scenario after the PM is fixed.
 */
export async function payOpenInvoiceForSubscription(opts: {
  stripe: Stripe;
  stripeSubscriptionId: string;
  stripeAccountId?: string;
}): Promise<Stripe.Invoice | null> {
  const reqOpts = opts.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined;
  const invoices = await opts.stripe.invoices.list(
    { subscription: opts.stripeSubscriptionId, status: 'open', limit: 5 },
    reqOpts,
  );
  const open = invoices.data[0];
  if (!open) return null;
  return opts.stripe.invoices.pay(open.id, {}, reqOpts);
}
