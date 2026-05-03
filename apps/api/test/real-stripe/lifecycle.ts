/**
 * Per-CI-run lifecycle: one BOS org + Connect-account row pointing at the
 * real Stripe test account. Customers are created per-test (each with its
 * own test clock) and torn down at the end of the test.
 */
import { TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';
import { StripeService } from '../../src/stripe/stripe.service';
import { SupabaseService } from '../../src/supabase/supabase.service';
import {
  seedOrganization,
  seedProduct,
  seedPrice,
  seedFeature,
  seedCustomer,
  type SeedOrg,
  type SeedProduct,
  type SeedPrice,
  type SeedFeature,
  type SeedCustomer,
} from '../integration/db-helpers';
import {
  cleanupTestStripeArtifacts,
  createTestClockedCustomer,
  type TestCardKind,
} from './stripe-test-helpers';

export interface TestRunOrg {
  org: SeedOrg;
  stripeAccountId: string;
}

/**
 * Spin up the run-scoped BOS org. Reuses `seedOrganization` with a
 * `stripeAccountId` override so the org's `accounts.stripe_id` points at
 * the real Connect account configured in CI.
 */
export async function createTestRunOrg(
  module: TestingModule,
  opts: { stripeAccountId: string; orgName?: string },
): Promise<TestRunOrg> {
  // Make this idempotent: prior runs (or interrupted runs) may have left an
  // active accounts row with this stripe_id, which collides with the partial
  // unique index `idx_accounts_stripe_id_active_unique`. Soft-delete those
  // first so the seedOrganization insert below succeeds.
  await retireStaleAccountsForStripeId(module, opts.stripeAccountId);

  const org = await seedOrganization(module, {
    orgName: opts.orgName ?? `RealStripe Test ${Date.now()}`,
    stripeAccountId: opts.stripeAccountId,
  });
  return { org, stripeAccountId: opts.stripeAccountId };
}

async function retireStaleAccountsForStripeId(
  module: TestingModule,
  stripeAccountId: string,
): Promise<void> {
  const supabase = module.get(SupabaseService).getClient() as any;
  await supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('stripe_id', stripeAccountId)
    .is('deleted_at', null);
}

export interface RealStripeProductFixture {
  product: SeedProduct;
  price: SeedPrice;
  features: Record<string, SeedFeature>;
}

export interface SeedRealStripeProductOpts {
  key: string;
  amount: number;
  trialDays?: number;
  features?: Array<{
    key: string;
    type?: 'boolean_flag' | 'usage_quota';
    limit?: number;
  }>;
  /** When set, the BOS row is wired to a pre-existing Stripe price. */
  stripePriceId?: string;
  stripeProductId?: string;
}

/**
 * Seed a BOS product + price + features AND the matching Stripe Product +
 * Price on the Connect account. The pipeline calls Stripe with the BOS
 * row's `stripe_price_id`, so that ID must actually exist in Stripe — we
 * can't fake it like the stripe-mock suite does.
 *
 * Skips Stripe for free products (no Stripe sub created for amount=0).
 */
export async function seedRealStripeProduct(
  module: TestingModule,
  orgId: string,
  stripeAccountId: string,
  opts: SeedRealStripeProductOpts,
): Promise<RealStripeProductFixture> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = module.get(SupabaseService).getClient() as any;

  // Idempotency: if a product with this name already exists in the org,
  // reuse it instead of creating fresh artifacts in BOS + Stripe.
  const { data: existingProduct } = await supabase
    .from('products')
    .select('id, organization_id, name, stripe_product_id, trial_days')
    .eq('organization_id', orgId)
    .eq('name', opts.key)
    .maybeSingle();

  if (existingProduct) {
    const { data: existingPrice } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', existingProduct.id)
      .maybeSingle();

    // Guard against silent fixture reuse with conflicting shapes — if two
    // tests register the same `key` with different trialDays or amount the
    // first call wins and later tests get the wrong product. Catch it here
    // instead of letting it cascade into mysterious assertion failures.
    const wantTrialDays = opts.trialDays ?? 0;
    const haveTrialDays = (existingProduct.trial_days as number) ?? 0;
    if (wantTrialDays !== haveTrialDays) {
      throw new Error(
        `Real-Stripe fixture conflict: product key '${opts.key}' was previously ` +
          `seeded with trial_days=${haveTrialDays} but a later call asked for ` +
          `trial_days=${wantTrialDays}. Use distinct keys for different variants.`,
      );
    }
    if (
      existingPrice &&
      typeof opts.amount === 'number' &&
      existingPrice.price_amount !== opts.amount &&
      !(opts.amount === 0 && existingPrice.amount_type === 'free')
    ) {
      throw new Error(
        `Real-Stripe fixture conflict: product key '${opts.key}' was previously ` +
          `seeded with amount=${existingPrice.price_amount} but a later call asked ` +
          `for amount=${opts.amount}. Use distinct keys for different variants.`,
      );
    }

    const { data: pfRows } = await supabase
      .from('product_features')
      .select('feature_id, features (id, organization_id, name, title, type)')
      .eq('product_id', existingProduct.id);
    const features: Record<string, SeedFeature> = {};
    for (const row of pfRows ?? []) {
      const f = row.features;
      if (f) features[f.name] = f;
    }
    return {
      product: existingProduct as SeedProduct,
      price: existingPrice as SeedPrice,
      features,
    };
  }

  const isFree = opts.amount === 0;
  let stripeProductId = opts.stripeProductId;
  let stripePriceId = opts.stripePriceId;

  if (!isFree && (!stripeProductId || !stripePriceId)) {
    const stripe = module.get(StripeService).getClient();
    const reqOpts = { stripeAccount: stripeAccountId };

    // Stable name keyed by the test fixture identifier — looked up first so
    // a fresh BOS DB doesn't trigger a new Stripe product on every CI run.
    // Connected account ends up with one product per unique key, reused.
    const stableName = `bos-test-${opts.key}`;
    if (!stripeProductId) {
      const existing = await findStripeProductByName(
        stripe,
        stableName,
        stripeAccountId,
      );
      stripeProductId =
        existing?.id ??
        (
          await stripe.products.create(
            {
              name: stableName,
              metadata: { source: 'billingos-real-stripe-tests' },
            },
            reqOpts,
          )
        ).id;
    }
    if (!stripePriceId) {
      // Find an existing recurring monthly price matching this amount.
      // Stripe prices are immutable; a product can have many prices, we
      // only reuse the one that matches our test's amount+interval.
      const prices = await stripe.prices.list(
        { product: stripeProductId, active: true, limit: 100 },
        reqOpts,
      );
      const matching = prices.data.find(
        (p) =>
          p.unit_amount === opts.amount &&
          p.currency === 'usd' &&
          p.recurring?.interval === 'month',
      );
      stripePriceId =
        matching?.id ??
        (
          await stripe.prices.create(
            {
              product: stripeProductId,
              unit_amount: opts.amount,
              currency: 'usd',
              recurring: { interval: 'month' },
            },
            reqOpts,
          )
        ).id;
    }
  }

  const product = await seedProduct(module, orgId, {
    name: opts.key,
    trialDays: opts.trialDays,
    stripeProductId,
  });
  const price = await seedPrice(module, product.id, {
    amount: opts.amount,
    amountType: isFree ? 'free' : 'fixed',
    stripePriceId,
  });
  const features: Record<string, SeedFeature> = {};
  for (const f of opts.features ?? []) {
    features[f.key] = await seedFeature(module, orgId, product.id, {
      name: f.key,
      type: f.type ?? 'boolean_flag',
      properties: f.limit !== undefined ? { limit: f.limit } : undefined,
    });
  }
  return { product, price, features };
}

export interface CreatedTestCustomer {
  bosCustomer: SeedCustomer;
  stripeCustomerId: string;
  testClockId: string;
}

export interface CreateTestCustomerOpts {
  module: TestingModule;
  org: TestRunOrg;
  /** Defaults to `test-${random}` external_id + email. */
  externalId?: string;
  email?: string;
  /** When set, attach the named test PM to the new Stripe customer. */
  paymentMethod?: TestCardKind;
}

/**
 * Per-test customer factory. Creates the Stripe customer + test clock on
 * the connected account, then mirrors into BOS.
 */
export async function createRealStripeCustomer(
  opts: CreateTestCustomerOpts,
): Promise<CreatedTestCustomer> {
  const stripe = opts.module.get(StripeService).getClient();
  const externalId = opts.externalId ?? `rs-${Date.now()}-${randomSuffix()}`;
  const email = opts.email ?? `${externalId}@test.billingos.dev`;

  const { stripeCustomerId, testClockId } = await createTestClockedCustomer({
    stripe,
    email,
    name: externalId,
    stripeAccountId: opts.org.stripeAccountId,
    paymentMethod: opts.paymentMethod,
  });

  const bosCustomer = await seedCustomer(opts.module, opts.org.org.id, {
    externalId,
    email,
    stripeCustomerId,
  });

  return { bosCustomer, stripeCustomerId, testClockId };
}

export async function cleanupRealStripeCustomer(
  module: TestingModule,
  org: TestRunOrg,
  customer: CreatedTestCustomer,
): Promise<void> {
  const stripe = module.get(StripeService).getClient();
  await cleanupTestStripeArtifacts({
    stripe,
    stripeCustomerId: customer.stripeCustomerId,
    testClockId: customer.testClockId,
    stripeAccountId: org.stripeAccountId,
  });
}

/**
 * End-of-run sweep. Best-effort: deletes every test clock and customer on
 * the Connect account that was created in this run window. Use sparingly
 * — listing across pages is slow.
 */
export async function sweepRealStripeArtifacts(opts: {
  stripe: Stripe;
  stripeAccountId: string;
  /** Only delete clocks/customers created after this timestamp (ms). */
  createdAfterMs: number;
}): Promise<{ clocksDeleted: number; customersDeleted: number }> {
  const reqOpts = { stripeAccount: opts.stripeAccountId };
  let clocksDeleted = 0;
  let customersDeleted = 0;

  const clocks = await opts.stripe.testHelpers.testClocks.list(
    { limit: 100 },
    reqOpts,
  );
  for (const clock of clocks.data) {
    if (clock.created * 1000 < opts.createdAfterMs) continue;
    try {
      await opts.stripe.testHelpers.testClocks.del(clock.id, reqOpts);
      clocksDeleted++;
    } catch {
      // ignore
    }
  }

  const customers = await opts.stripe.customers.list({ limit: 100 }, reqOpts);
  for (const customer of customers.data) {
    if (customer.created * 1000 < opts.createdAfterMs) continue;
    if (!customer.email?.endsWith('@test.billingos.dev')) continue;
    try {
      await opts.stripe.customers.del(customer.id, reqOpts);
      customersDeleted++;
    } catch {
      // ignore
    }
  }

  return { clocksDeleted, customersDeleted };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * List products on the Connect account and return the first one whose
 * `name` matches exactly. Pages through up to ~500 products defensively;
 * a typical test account only ever has ~5.
 */
async function findStripeProductByName(
  stripe: Stripe,
  name: string,
  stripeAccountId: string,
): Promise<Stripe.Product | null> {
  const reqOpts = { stripeAccount: stripeAccountId };
  let startingAfter: string | undefined;
  for (let i = 0; i < 5; i++) {
    const page = await stripe.products.list(
      { limit: 100, active: true, starting_after: startingAfter },
      reqOpts,
    );
    const hit = page.data.find((p) => p.name === name);
    if (hit) return hit;
    if (!page.has_more) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) return null;
  }
  return null;
}
