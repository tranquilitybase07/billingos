/**
 * One-shot bootstrapper: creates an Express connected account on the
 * platform whose `STRIPE_SECRET_KEY` is in the env, auto-verifies it
 * with Stripe's documented magic test values, then prints the acct_...
 * ID for you to export as STRIPE_TEST_CONNECT_ACCOUNT.
 *
 * Run:  pnpm setup:test-connect-account
 * Then: export STRIPE_TEST_CONNECT_ACCOUNT=acct_...
 */
import Stripe from 'stripe';

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a sk_test_* key (got ${key?.slice(0, 8) ?? '<unset>'}).`,
    );
  }
  const stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' });

  const platform = await stripe.accounts.retrieve();
  console.log(`Platform account: ${platform.id}`);
  console.log('Creating connected Express account...');

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: `bos-test-${Date.now()}@example.com`,
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { source: 'billingos-real-stripe-test-suite' },
  });
  console.log(`  · created ${account.id}`);

  console.log('Auto-verifying with Stripe magic test values...');
  // Identity + profile + TOS in one update; bank in a second update because
  // Stripe's Express endpoint sometimes rejects the combined payload.
  await stripe.accounts.update(account.id, {
    individual: {
      first_name: 'Test',
      last_name: 'Merchant',
      email: account.email ?? undefined,
      phone: '+16505551234',
      dob: { day: 1, month: 1, year: 1901 },
      address: {
        line1: 'address_full_match',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US',
      },
      ssn_last_4: '0000',
    } as Stripe.AccountUpdateParams.Individual,
    business_profile: {
      mcc: '5734',
      name: 'BillingOS Test Merchant',
      url: 'https://example.com',
    },
    settings: {
      payments: { statement_descriptor: 'BOSTEST' },
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: '127.0.0.1',
      user_agent: 'BillingOS Real-Stripe Test Setup',
    },
  });

  await stripe.accounts.update(account.id, {
    // Bank-account shape isn't exported as a named type on AccountUpdateParams
    // in this Stripe SDK version; matches the inline cast in stripe.service.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    external_account: {
      object: 'bank_account',
      country: 'US',
      currency: 'usd',
      account_holder_name: 'Test Merchant',
      account_holder_type: 'individual',
      routing_number: '110000000',
      account_number: '000123456789',
    } as any,
  });

  // Re-fetch to confirm capabilities flipped on.
  const verified = await stripe.accounts.retrieve(account.id);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Connected account ready: ${verified.id}`);
  console.log(
    `   charges_enabled=${verified.charges_enabled} ` +
      `payouts_enabled=${verified.payouts_enabled} ` +
      `details_submitted=${verified.details_submitted}`,
  );
  console.log('');
  console.log('Add this to your shell:');
  console.log('');
  console.log(`  export STRIPE_TEST_CONNECT_ACCOUNT=${verified.id}`);
  console.log('');
  console.log('Then re-run:  pnpm test:real-stripe');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!verified.charges_enabled) {
    console.warn(
      '\n⚠️  charges_enabled=false. Stripe occasionally takes a few seconds to ' +
        'flip the flag after the bank-account update. Wait 30s and re-fetch ' +
        `with: stripe accounts retrieve ${verified.id}`,
    );
  }
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message ?? err);
  process.exit(1);
});
