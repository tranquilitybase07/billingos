import './load-env';
import Stripe from 'stripe';

const TEST_METADATA_FLAG = 'bos_integration_test';

export default async function globalTeardown(): Promise<void> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-10-28.acacia' as Stripe.LatestApiVersion,
  });

  // Safety net: sweep any Test Clocks tagged by integration tests.
  // Tests should clean up their own clocks; this catches leaks from crashes.
  try {
    const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
    const orphaned = clocks.data.filter(
      (c) => c.metadata?.[TEST_METADATA_FLAG] === '1',
    );
    for (const c of orphaned) {
      try {
        await stripe.testHelpers.testClocks.del(c.id);
      } catch {
        // Best-effort cleanup
      }
    }
    if (orphaned.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[integration] Swept ${orphaned.length} orphaned Stripe Test Clock(s).`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[integration] Test Clock cleanup failed: ${(err as Error).message}`,
    );
  }
}
