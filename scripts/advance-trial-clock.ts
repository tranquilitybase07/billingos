#!/usr/bin/env tsx
/**
 * Advances Grace's Stripe test clock past her trial_end to exercise the
 * trialing → active conversion. Run after seed-stripe-test-data.ts + the BOS
 * import has completed.
 *
 * Stripe will fire customer.subscription.updated + invoice.* webhooks as the
 * clock advances. Make sure `stripe listen --forward-to localhost:3001/stripe/webhooks`
 * is running so BOS picks them up.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_ACCOUNT=acct_... \
 *     pnpm tsx scripts/advance-trial-clock.ts
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

async function main() {
  const customers = await stripe.customers.list(
    { email: 'grace@test.bos', limit: 100 },
    opts,
  );
  const grace = customers.data.find((c) => !!c.test_clock);
  if (!grace) {
    console.error(
      'Could not find Grace with a test clock. Run seed-stripe-test-data.ts first.',
    );
    process.exit(1);
  }

  const subs = await stripe.subscriptions.list(
    { customer: grace.id, limit: 1 },
    opts,
  );
  const sub = subs.data[0];
  if (!sub) {
    console.error('Grace has no subscription.');
    process.exit(1);
  }
  if (sub.status === 'active') {
    console.log(`Subscription ${sub.id} is already active. Nothing to do.`);
    return;
  }
  if (!sub.trial_end) {
    console.error(
      `Subscription ${sub.id} is not in a trial (status=${sub.status}).`,
    );
    process.exit(1);
  }

  const clockId = grace.test_clock as string;
  const target = sub.trial_end + 24 * 60 * 60; // trial_end + 1 day

  console.log(
    `Advancing test clock ${clockId} → ${new Date(target * 1000).toISOString()}…`,
  );

  await stripe.testHelpers.testClocks.advance(
    clockId,
    { frozen_time: target },
    opts,
  );

  let clock = await stripe.testHelpers.testClocks.retrieve(clockId, opts);
  while (clock.status === 'advancing') {
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1500));
    clock = await stripe.testHelpers.testClocks.retrieve(clockId, opts);
  }
  console.log('');

  if (clock.status !== 'ready') {
    console.error(`Clock advance failed: status=${clock.status}`);
    process.exit(1);
  }

  const updated = await stripe.subscriptions.retrieve(sub.id, opts);
  console.log(`Subscription ${sub.id} status: ${updated.status}`);
  console.log(
    'Webhook events should have fired — verify in your `stripe listen` window and check BOS via SQL.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
