/**
 * High-level integration test scenario builder.
 *
 * Wraps the atomic seed helpers in `db-helpers.ts` and exposes a single
 * `initScenario({ products, actions })` entry point that drives the new
 * 4-phase billing pipeline (BillingService) and webhook middleware end-to-end.
 *
 * The scenario builder is the
 * preferred surface for new integration tests; reach for the atomic helpers
 * directly only when a test needs setup that this builder can't express.
 */
import { TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { BillingService } from '../../src/billing/billing.service';
import { WebhookMiddleware } from '../../src/billing/webhooks/webhook.middleware';
import { EntitlementService } from '../../src/billing/entitlements/entitlement.service';
import { CreateCheckoutDto } from '../../src/v1/checkout/dto/create-checkout.dto';
import { CheckoutSession } from '../../src/v1/checkout/checkout.service';
import {
  seedOrganization,
  seedProduct,
  seedPrice,
  seedCustomer,
  seedFeature,
  type SeedOrg,
  type SeedProduct,
  type SeedPrice,
  type SeedCustomer,
  type SeedFeature,
} from './db-helpers';

// ---------- Public types ----------

export interface ScenarioFeatureSpec {
  /** Stable key used to look up the seeded feature inside the scenario context */
  key: string;
  type?: 'boolean_flag' | 'usage_quota' | 'numeric_limit';
  title?: string;
  /** For usage_quota features — written into feature.properties.limit */
  limit?: number;
}

export interface ScenarioProductSpec {
  /** Stable key used to reference this product in actions and assertions */
  key: string;
  /** Price in minor units (cents). Use 0 for free products. */
  amount: number;
  currency?: string;
  interval?: 'day' | 'week' | 'month' | 'year';
  intervalCount?: number;
  trialDays?: number;
  features?: ScenarioFeatureSpec[];
  name?: string;
}

export type ScenarioAction =
  | {
      type: 'subscribe';
      productKey: string;
      couponCode?: string;
      existingSubscriptionId?: string;
      /** Default true — auto-call executeCheckout if preview returned a deferred session */
      autoExecute?: boolean;
    }
  | { type: 'execute'; sessionId: string }
  | { type: 'webhook'; event: Stripe.Event };

export interface ScenarioInput {
  module: TestingModule;
  organization?: { name?: string; stripeAccountId?: string };
  customer?: { externalId?: string; email?: string; name?: string };
  products: ScenarioProductSpec[];
  actions?: ScenarioAction[];
}

export interface ScenarioContext {
  org: SeedOrg;
  customer: SeedCustomer;
  /** Keyed by product `key` from the input spec */
  products: Record<string, { product: SeedProduct; price: SeedPrice }>;
  /** Keyed by `${productKey}.${featureKey}` to avoid collisions across products */
  features: Record<string, SeedFeature>;
  /** All CheckoutSession responses returned by `subscribe` / `execute` actions, in order */
  checkouts: CheckoutSession[];
  // Service handles for direct use in test bodies
  billingService: BillingService;
  webhookMiddleware: WebhookMiddleware;
  entitlementService: EntitlementService;
}

// ---------- Builder ----------

export async function initScenario(
  input: ScenarioInput,
): Promise<ScenarioContext> {
  const { module } = input;

  const org = await seedOrganization(module, {
    orgName: input.organization?.name,
    stripeAccountId: input.organization?.stripeAccountId,
  });

  const customer = await seedCustomer(module, org.id, {
    externalId: input.customer?.externalId,
    email: input.customer?.email,
    name: input.customer?.name,
  });

  const products: ScenarioContext['products'] = {};
  const features: ScenarioContext['features'] = {};

  for (const p of input.products) {
    const product = await seedProduct(module, org.id, {
      name: p.name,
      trialDays: p.trialDays,
    });
    const price = await seedPrice(module, product.id, {
      amount: p.amount,
      currency: p.currency,
      amountType: p.amount === 0 ? 'free' : 'fixed',
      interval: p.interval,
      intervalCount: p.intervalCount,
    });
    products[p.key] = { product, price };

    for (const f of p.features ?? []) {
      const feature = await seedFeature(module, org.id, product.id, {
        name: f.key,
        title: f.title ?? f.key,
        type: f.type ?? 'boolean_flag',
        properties: f.limit !== undefined ? { limit: f.limit } : undefined,
      });
      features[`${p.key}.${f.key}`] = feature;
    }
  }

  const billingService = module.get(BillingService);
  const webhookMiddleware = module.get(WebhookMiddleware);
  const entitlementService = module.get(EntitlementService);

  const ctx: ScenarioContext = {
    org,
    customer,
    products,
    features,
    checkouts: [],
    billingService,
    webhookMiddleware,
    entitlementService,
  };

  for (const action of input.actions ?? []) {
    await runAction(ctx, action);
  }

  return ctx;
}

// ---------- Action runners ----------

/**
 * Run a single action against an already-built ScenarioContext.
 * Useful for tests that need to drive additional actions after the initial
 * `initScenario` setup (e.g. fire a webhook, then assert state).
 */
export async function runAction(
  ctx: ScenarioContext,
  action: ScenarioAction,
): Promise<void> {
  if (action.type === 'subscribe') {
    const target = ctx.products[action.productKey];
    if (!target) {
      throw new Error(
        `Scenario action "subscribe" references unknown productKey: ${action.productKey}`,
      );
    }
    const dto: CreateCheckoutDto = {
      priceId: target.price.id,
      customerEmail: ctx.customer.email,
      customerName: ctx.customer.name,
      couponCode: action.couponCode,
      existingSubscriptionId: action.existingSubscriptionId,
    };
    const previewed = await ctx.billingService.previewCheckout(
      ctx.org.id,
      ctx.customer.external_id,
      dto,
    );
    ctx.checkouts.push(previewed);

    // Deferred flows (free, in-place upgrade, in-place downgrade,
    // trial-to-trial downgrade) return a pending session with no clientSecret.
    // Auto-execute by default so the test body sees the final state.
    const autoExecute = action.autoExecute ?? true;
    const isDeferred = previewed.clientSecret === '' && previewed.id !== '';
    if (autoExecute && isDeferred) {
      const executed = await ctx.billingService.executeCheckout(
        ctx.org.id,
        previewed.id,
      );
      ctx.checkouts.push(executed);
    }
    return;
  }

  if (action.type === 'execute') {
    const executed = await ctx.billingService.executeCheckout(
      ctx.org.id,
      action.sessionId,
    );
    ctx.checkouts.push(executed);
    return;
  }

  if (action.type === 'webhook') {
    await ctx.webhookMiddleware.handleEvent(action.event);
    return;
  }
}

// ---------- Convenience accessors ----------

/** Last CheckoutSession returned by any subscribe/execute action. */
export function lastCheckout(ctx: ScenarioContext): CheckoutSession {
  if (ctx.checkouts.length === 0) {
    throw new Error('No checkouts have been driven in this scenario yet.');
  }
  return ctx.checkouts[ctx.checkouts.length - 1];
}
