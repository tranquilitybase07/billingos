#!/usr/bin/env tsx
/**
 * Seed test data on a connected Stripe (test mode) account so you can
 * exercise the Stripe → BOS import flow end-to-end. Designed to mimic the
 * shape of a real merchant's account: a mix of customers (with and without
 * email, with metadata.external_id and without), a couple of products with
 * one-off prices, and a handful of active subscriptions.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_ACCOUNT=acct_... \
 *     pnpm tsx scripts/seed-stripe-test-data.ts
 *
 * To find your connected account ID:
 *   psql $DATABASE_URL -c "select stripe_id from accounts a
 *     join organizations o on o.account_id = a.id
 *     where o.slug = '<your-org-slug>';"
 *
 * The script is idempotent at the customer-level (deterministic emails) so
 * you can re-run it; subscriptions are always new.
 */
import Stripe from 'stripe';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ACCOUNT_ID = process.env.STRIPE_ACCOUNT;

if (!SECRET_KEY || !ACCOUNT_ID) {
  console.error(
    'STRIPE_SECRET_KEY and STRIPE_ACCOUNT env vars are required.',
  );
  process.exit(1);
}

const stripe = new Stripe(SECRET_KEY);
const opts = { stripeAccount: ACCOUNT_ID };

async function findOrCreateCustomer(spec: {
  email: string | null;
  name: string;
  externalIdInMetadata?: string;
}) {
  if (spec.email) {
    const existing = await stripe.customers.list(
      { email: spec.email, limit: 1 },
      opts,
    );
    if (existing.data[0]) return existing.data[0];
  }
  return stripe.customers.create(
    {
      email: spec.email || undefined,
      name: spec.name,
      metadata: spec.externalIdInMetadata
        ? { external_id: spec.externalIdInMetadata }
        : {},
    },
    opts,
  );
}

async function findOrCreateProduct(name: string) {
  const existing = await stripe.products.search(
    { query: `name:"${name}"` },
    opts,
  );
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({ name }, opts);
}

async function findOrCreatePrice(
  productId: string,
  amountCents: number,
  interval: 'month' | 'year',
) {
  const existing = await stripe.prices.list(
    { product: productId, limit: 20 },
    opts,
  );
  const match = existing.data.find(
    (p) =>
      p.unit_amount === amountCents &&
      p.recurring?.interval === interval &&
      p.active,
  );
  if (match) return match;
  return stripe.prices.create(
    {
      product: productId,
      unit_amount: amountCents,
      currency: 'usd',
      recurring: { interval },
    },
    opts,
  );
}

async function attachPaymentMethod(customerId: string) {
  // Stripe's test PaymentMethod token for a successful charge.
  const pm = await stripe.paymentMethods.create(
    {
      type: 'card',
      card: { token: 'tok_visa' },
    },
    opts,
  );
  await stripe.paymentMethods.attach(pm.id, { customer: customerId }, opts);
  await stripe.customers.update(
    customerId,
    { invoice_settings: { default_payment_method: pm.id } },
    opts,
  );
  return pm.id;
}

async function ensureSubscription(customerId: string, priceId: string) {
  const existing = await stripe.subscriptions.list(
    { customer: customerId, status: 'active', limit: 1 },
    opts,
  );
  if (existing.data[0]) return existing.data[0];
  await attachPaymentMethod(customerId);
  return stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: priceId }],
      off_session: true,
    },
    opts,
  );
}

// Grace lives on a Stripe test clock so we can fast-forward time and watch the
// trial → active conversion. Idempotent: re-runs reuse the first Grace that
// still has a clock attached. To reset, delete her test clock in the Stripe
// Dashboard (Developers → Test clocks) and re-run seed.
async function ensureTrialingCustomer(priceId: string) {
  const email = 'grace@test.bos';
  const existing = await stripe.customers.list({ email, limit: 100 }, opts);

  for (const c of existing.data) {
    if (c.test_clock) return c;
  }

  const clock = await stripe.testHelpers.testClocks.create(
    {
      frozen_time: Math.floor(Date.now() / 1000),
      name: 'BOS migration trial test',
    },
    opts,
  );
  const customer = await stripe.customers.create(
    {
      email,
      name: 'Grace (in trial — test clock)',
      test_clock: clock.id,
      metadata: { external_id: 'user_grace' },
    },
    opts,
  );
  await attachPaymentMethod(customer.id);
  await stripe.subscriptions.create(
    {
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 14,
    },
    opts,
  );
  return customer;
}

async function main() {
  console.log(`Seeding Stripe account ${ACCOUNT_ID}…`);

  // ── Products + prices ──
  const proProduct = await findOrCreateProduct('Pro Plan');
  const teamProduct = await findOrCreateProduct('Team Plan');
  const unmappedProduct = await findOrCreateProduct('Legacy Plan (unmapped)');

  const proPrice = await findOrCreatePrice(proProduct.id, 2900, 'month');
  const teamPrice = await findOrCreatePrice(teamProduct.id, 9900, 'month');
  const unmappedPrice = await findOrCreatePrice(
    unmappedProduct.id,
    500,
    'month',
  );

  console.log(`  ✓ Products: ${proProduct.name}, ${teamProduct.name}, ${unmappedProduct.name}`);

  // ── Customers ──
  // 1. Happy path: email + metadata.external_id → bound at import time.
  const alice = await findOrCreateCustomer({
    email: 'alice@test.bos',
    name: 'Alice (metadata-bound)',
    externalIdInMetadata: 'user_alice',
  });

  // 2. Lazy-bind path: email, no metadata → binds when SDK sees session token.
  const bob = await findOrCreateCustomer({
    email: 'bob@test.bos',
    name: 'Bob (lazy-bind)',
  });

  // 3. Stuck: no email at all → Needs Attention.
  const charlie = await findOrCreateCustomer({
    email: null,
    name: 'Charlie (no email — stuck)',
  });

  // 4. Stuck: email collision (two customers, same email) → Needs Attention.
  const daveA = await findOrCreateCustomer({
    email: 'shared@test.bos',
    name: 'Dave A (collision)',
  });
  const daveB = await stripe.customers.create(
    {
      email: 'shared@test.bos',
      name: 'Dave B (collision)',
    },
    opts,
  );

  // 5. Customer whose Stripe product won't be mapped → sub skipped.
  const erin = await findOrCreateCustomer({
    email: 'erin@test.bos',
    name: 'Erin (on unmapped product)',
  });

  // 6. Trialing customer on a Stripe test clock → exercises trial import +
  //    trial-to-active conversion (see scripts/advance-trial-clock.ts).
  await ensureTrialingCustomer(proPrice.id);

  console.log(
    `  ✓ Customers: alice, bob, charlie, daveA, daveB, erin, grace`,
  );

  // ── Subscriptions ──
  await ensureSubscription(alice.id, proPrice.id);
  await ensureSubscription(bob.id, proPrice.id);
  await ensureSubscription(charlie.id, teamPrice.id);
  await ensureSubscription(daveA.id, proPrice.id);
  await ensureSubscription(daveB.id, teamPrice.id);
  await ensureSubscription(erin.id, unmappedPrice.id);
  // Grace's subscription was created alongside her in ensureTrialingCustomer.

  console.log(`  ✓ Subscriptions: 6 active + 1 trialing (grace)`);
  console.log(
    `  ↳ Advance Grace's clock with: pnpm tsx scripts/advance-trial-clock.ts`,
  );
  console.log('Done. Run the import wizard from Settings → Import Data.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
