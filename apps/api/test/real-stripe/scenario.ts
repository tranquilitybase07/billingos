/**
 * Real-Stripe scenario builder. Same shape as
 * `test/integration/scenario.ts` but with two differences:
 *
 *   1. Customer creation provisions a real Stripe customer + test clock
 *      via `lifecycle.createRealStripeCustomer`.
 *   2. A new `advanceClock` action drives Stripe's test clock forward and
 *      then synthetically replays the resulting Stripe events through
 *      `WebhookMiddleware.handleEvent`. This keeps webhook handler logic
 *      under test without requiring a public webhook endpoint.
 */
import type { TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';
import { BillingService } from '../../src/billing/billing.service';
import { WebhookMiddleware } from '../../src/billing/webhooks/webhook.middleware';
import { EntitlementService } from '../../src/billing/entitlements/entitlement.service';
import { StripeService } from '../../src/stripe/stripe.service';
import { CreateCheckoutDto } from '../../src/v1/checkout/dto/create-checkout.dto';
import { CheckoutSession } from '../../src/v1/checkout/checkout.service';
import {
  createRealStripeCustomer,
  cleanupRealStripeCustomer,
  seedRealStripeProduct,
  type CreatedTestCustomer,
  type RealStripeProductFixture,
  type SeedRealStripeProductOpts,
  type TestRunOrg,
} from './lifecycle';
import {
  advanceTestClock,
  confirmTestPaymentIntent,
  confirmTestSetupIntent,
  payOpenInvoiceForSubscription,
  swapStripePaymentMethod,
  type TestCardKind,
} from './stripe-test-helpers';

export type RealScenarioAction =
  | {
      type: 'subscribe';
      productKey: string;
      existingSubscriptionId?: string;
      couponCode?: string;
      autoExecute?: boolean;
    }
  | { type: 'execute'; sessionId: string }
  | { type: 'webhook'; event: Stripe.Event }
  | {
      type: 'advanceClock';
      days?: number;
      weeks?: number;
      months?: number;
      hours?: number;
      replayEvents?: boolean;
    }
  | {
      type: 'confirmCheckout';
      /** Defaults to `'success'`. */
      paymentMethod?: TestCardKind;
      /** Defaults to true — replay events after confirming. */
      replayEvents?: boolean;
    }
  | { type: 'swapPaymentMethod'; kind: TestCardKind }
  | {
      type: 'payOpenInvoice';
      /** Stripe sub id whose latest open invoice should be paid. */
      stripeSubscriptionId: string;
      replayEvents?: boolean;
    }
  | {
      type: 'cancelNow';
      /** Stripe sub id to cancel. */
      stripeSubscriptionId: string;
      replayEvents?: boolean;
    };

export interface RealScenarioInput {
  module: TestingModule;
  org: TestRunOrg;
  customer?: {
    externalId?: string;
    email?: string;
    paymentMethod?: 'success' | 'fail' | 'authRequired';
  };
  products: Array<SeedRealStripeProductOpts>;
  actions?: RealScenarioAction[];
}

export interface RealScenarioContext {
  org: TestRunOrg;
  customer: CreatedTestCustomer;
  /** Keyed by product `key` from input. */
  products: Record<string, RealStripeProductFixture>;
  checkouts: CheckoutSession[];
  /** Stripe events that arrived since the last `advanceClock` (newest first). */
  lastClockEvents: Stripe.Event[];
  module: TestingModule;
  billingService: BillingService;
  webhookMiddleware: WebhookMiddleware;
  entitlementService: EntitlementService;
  /** Best-effort cleanup — call from afterEach. */
  cleanup: () => Promise<void>;
}

export async function initRealScenario(
  input: RealScenarioInput,
): Promise<RealScenarioContext> {
  const customer = await createRealStripeCustomer({
    module: input.module,
    org: input.org,
    externalId: input.customer?.externalId,
    email: input.customer?.email,
    paymentMethod: input.customer?.paymentMethod,
  });

  const products: Record<string, RealStripeProductFixture> = {};
  for (const p of input.products) {
    products[p.key] = await seedRealStripeProduct(
      input.module,
      input.org.org.id,
      input.org.stripeAccountId,
      p,
    );
  }

  const ctx: RealScenarioContext = {
    org: input.org,
    customer,
    products,
    checkouts: [],
    lastClockEvents: [],
    module: input.module,
    billingService: input.module.get(BillingService),
    webhookMiddleware: input.module.get(WebhookMiddleware),
    entitlementService: input.module.get(EntitlementService),
    cleanup: () => cleanupRealStripeCustomer(input.module, input.org, customer),
  };

  for (const action of input.actions ?? []) {
    await runRealAction(ctx, action);
  }
  return ctx;
}

export async function runRealAction(
  ctx: RealScenarioContext,
  action: RealScenarioAction,
): Promise<void> {
  if (action.type === 'subscribe') {
    const target = ctx.products[action.productKey];
    if (!target) throw new Error(`Unknown productKey: ${action.productKey}`);
    const dto: CreateCheckoutDto = {
      priceId: target.price.id,
      customerEmail: ctx.customer.bosCustomer.email,
      customerName: ctx.customer.bosCustomer.name,
      couponCode: action.couponCode,
      existingSubscriptionId: action.existingSubscriptionId,
    };
    const previewed = await ctx.billingService.previewCheckout(
      ctx.org.org.id,
      ctx.customer.bosCustomer.external_id,
      dto,
    );
    ctx.checkouts.push(previewed);

    const isDeferred = previewed.clientSecret === '' && previewed.id !== '';
    if ((action.autoExecute ?? true) && isDeferred) {
      const executed = await ctx.billingService.executeCheckout(
        ctx.org.org.id,
        previewed.id,
      );
      ctx.checkouts.push(executed);
    }
    return;
  }

  if (action.type === 'execute') {
    const executed = await ctx.billingService.executeCheckout(
      ctx.org.org.id,
      action.sessionId,
    );
    ctx.checkouts.push(executed);
    return;
  }

  if (action.type === 'webhook') {
    await ctx.webhookMiddleware.handleEvent(action.event);
    return;
  }

  if (action.type === 'advanceClock') {
    const stripe = ctx.module.get(StripeService).getClient();
    const before = Math.floor(Date.now() / 1000);
    await advanceTestClock({
      stripe,
      testClockId: ctx.customer.testClockId,
      stripeAccountId: ctx.org.stripeAccountId,
      numberOfDays: action.days,
      numberOfWeeks: action.weeks,
      numberOfMonths: action.months,
      numberOfHours: action.hours,
    });

    if (action.replayEvents !== false) {
      await replayEventsSince(ctx, before);
    }
    return;
  }

  if (action.type === 'confirmCheckout') {
    const stripe = ctx.module.get(StripeService).getClient();
    const last = ctx.checkouts[ctx.checkouts.length - 1];
    if (!last)
      throw new Error('confirmCheckout: no prior checkout to confirm.');
    const before = Math.floor(Date.now() / 1000);

    // Trial flows return a SetupIntent secret; paid flows return a PI secret.
    const isSetupIntent = last.clientSecret.startsWith('seti_');
    if (isSetupIntent) {
      const setupIntentId = last.clientSecret.split('_secret_')[0];
      await confirmTestSetupIntent({
        stripe,
        setupIntentId,
        paymentMethod: action.paymentMethod ?? 'success',
        stripeAccountId: ctx.org.stripeAccountId,
      });
    } else {
      const piId =
        last.paymentIntentId || last.clientSecret.split('_secret_')[0];
      await confirmTestPaymentIntent({
        stripe,
        paymentIntentId: piId,
        paymentMethod: action.paymentMethod ?? 'success',
        stripeAccountId: ctx.org.stripeAccountId,
      });
    }

    if (action.replayEvents !== false) {
      // Poll: Stripe events typically fire within 5-10s after PI/SI confirm.
      // Wait for at least one relevant event before replaying so we don't
      // replay-on-empty and leave the BOS sub stuck in `incomplete`.
      const expectedTypes = isSetupIntent
        ? ['setup_intent.succeeded']
        : ['payment_intent.succeeded'];
      await replayEventsSince(ctx, before, { expect: expectedTypes });
    }
    return;
  }

  if (action.type === 'swapPaymentMethod') {
    const stripe = ctx.module.get(StripeService).getClient();
    await swapStripePaymentMethod({
      stripe,
      stripeCustomerId: ctx.customer.stripeCustomerId,
      kind: action.kind,
      stripeAccountId: ctx.org.stripeAccountId,
    });
    return;
  }

  if (action.type === 'payOpenInvoice') {
    const stripe = ctx.module.get(StripeService).getClient();
    const before = Math.floor(Date.now() / 1000);
    await payOpenInvoiceForSubscription({
      stripe,
      stripeSubscriptionId: action.stripeSubscriptionId,
      stripeAccountId: ctx.org.stripeAccountId,
    });
    await wait(3_000);
    if (action.replayEvents !== false) {
      await replayEventsSince(ctx, before);
    }
    return;
  }

  if (action.type === 'cancelNow') {
    const stripe = ctx.module.get(StripeService).getClient();
    const before = Math.floor(Date.now() / 1000);
    await stripe.subscriptions.cancel(action.stripeSubscriptionId, {
      stripeAccount: ctx.org.stripeAccountId,
    } as Stripe.RequestOptions);
    await wait(2_000);
    if (action.replayEvents !== false) {
      await replayEventsSince(ctx, before);
    }
    return;
  }
}

async function replayEventsSince(
  ctx: RealScenarioContext,
  sinceSeconds: number,
  opts: { expect?: string[]; timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const stripe = ctx.module.get(StripeService).getClient();
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const pollMs = opts.pollIntervalMs ?? 1_500;
  const expect = opts.expect ?? [];

  let events: Stripe.Event[] = [];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    events = await fetchEventsSince({
      stripe,
      stripeAccountId: ctx.org.stripeAccountId,
      sinceSeconds,
    });
    const haveExpected =
      expect.length === 0 || expect.some((t) => events.some((e) => e.type === t));
    if (haveExpected && events.length > 0) break;
    await wait(pollMs);
  }

  ctx.lastClockEvents = events;

  if (process.env.DEBUG_REAL_STRIPE) {
    const elapsed = Date.now() - start;
    const types = events.map((e) => e.type).reverse();
    // eslint-disable-next-line no-console
    console.log(
      `[real-stripe] replay (${elapsed}ms, ${events.length} events): ${types.join(', ')}`,
    );
  }

  // events.list returns newest first; replay in chronological order.
  for (const event of [...events].reverse()) {
    await ctx.webhookMiddleware.handleEvent(event);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull every Stripe event since `sinceSeconds`. We iterate via `starting_after`
 * to handle pagination because a single clock advance commonly emits 5-10
 * events (invoice.created → invoice.finalized → payment_intent.succeeded →
 * invoice.paid → customer.subscription.updated → ...).
 */
async function fetchEventsSince(opts: {
  stripe: Stripe;
  stripeAccountId: string;
  sinceSeconds: number;
}): Promise<Stripe.Event[]> {
  const reqOpts = { stripeAccount: opts.stripeAccountId };
  const collected: Stripe.Event[] = [];
  let startingAfter: string | undefined;
  // Cap iterations defensively.
  for (let i = 0; i < 10; i++) {
    const page = await opts.stripe.events.list(
      {
        limit: 100,
        created: { gte: opts.sinceSeconds },
        starting_after: startingAfter,
      },
      reqOpts,
    );
    collected.push(...page.data);
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return collected;
}

export function lastCheckout(ctx: RealScenarioContext): CheckoutSession {
  if (ctx.checkouts.length === 0) {
    throw new Error('No checkouts in this scenario yet.');
  }
  return ctx.checkouts[ctx.checkouts.length - 1];
}
