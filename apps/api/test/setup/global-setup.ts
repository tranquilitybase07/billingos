import './load-env';
import { assertTestEnv } from './env';
import { createClient } from 'redis';
import Stripe from 'stripe';

export default async function globalSetup(): Promise<void> {
  assertTestEnv();

  // Supabase reachable
  const supabaseUrl = process.env.SUPABASE_URL!;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY! },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `Supabase not reachable at ${supabaseUrl}. Run \`supabase start\` first. (${(err as Error).message})`,
    );
  }

  // Redis reachable
  const redis = createClient({ url: process.env.REDIS_URL });
  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
  } catch (err) {
    throw new Error(
      `Redis not reachable at ${process.env.REDIS_URL}. Start redis-server. (${(err as Error).message})`,
    );
  }

  // Stripe reachable + key valid
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-10-28.acacia' as Stripe.LatestApiVersion,
  });
  try {
    await stripe.balance.retrieve();
  } catch (err) {
    throw new Error(
      `Stripe test API not reachable or key invalid. (${(err as Error).message})`,
    );
  }

  // Stripe CLI webhook forwarding — can't reliably detect; surface a hint.
  // BOTH flags required: --forward-to (platform events) AND --forward-connect-to (Connect account events).
  // Our checkout creates PaymentIntents on the Connect account so the webhook fires there.
  // eslint-disable-next-line no-console
  console.log(
    `\n[integration] Webhook tests require this in a separate terminal:\n  stripe listen \\\n    --forward-to localhost:${process.env.PORT}/stripe/webhooks \\\n    --forward-connect-to localhost:${process.env.PORT}/stripe/webhooks\n`,
  );
}
