/**
 * One-shot: archive old `test-<key>-<timestamp>` Stripe products left over
 * from earlier runs of the real-Stripe suite. Stripe doesn't allow
 * deleting products that have prices, so we set `active: false` instead —
 * archived products are filtered out of dashboard lists.
 *
 * Run:  pnpm cleanup:test-products
 */
import Stripe from 'stripe';

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  const account = process.env.STRIPE_TEST_CONNECT_ACCOUNT;
  if (!key || !key.startsWith('sk_test_'))
    throw new Error('STRIPE_SECRET_KEY must be a sk_test_* key.');
  if (!account)
    throw new Error('STRIPE_TEST_CONNECT_ACCOUNT must be set (acct_...).');

  const stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  const reqOpts = { stripeAccount: account };

  // The legacy naming was `test-<key>-<unixms>`; the new stable naming is
  // `bos-test-<key>`. Archive the legacy ones; leave the stable ones alone.
  const legacy = /^test-[A-Za-z0-9_]+-\d+$/;
  let archived = 0;
  let scanned = 0;
  let startingAfter: string | undefined;

  for (let i = 0; i < 20; i++) {
    const page = await stripe.products.list(
      { limit: 100, active: true, starting_after: startingAfter },
      reqOpts,
    );
    for (const p of page.data) {
      scanned++;
      if (legacy.test(p.name)) {
        try {
          await stripe.products.update(p.id, { active: false }, reqOpts);
          archived++;
        } catch (err) {
          console.warn(`  · failed to archive ${p.id} (${p.name}):`, err);
        }
      }
    }
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  console.log(`Scanned ${scanned} active products; archived ${archived} legacy test products.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message ?? err);
  process.exit(1);
});
