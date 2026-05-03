/**
 * Jest globalSetup for real-Stripe tests. Verifies that env, Supabase,
 * Redis, and the Stripe API are reachable before any spec file evaluates.
 * Failing here is much cheaper than failing inside a test.
 */
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';
import Stripe from 'stripe';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Resolve `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Prefer env vars
 * (CI sets them from `supabase status` output). Locally fall back to
 * shelling out to the Supabase CLI so devs don't have to copy keys.
 */
function resolveSupabaseEnv(): { url: string; serviceRoleKey: string } {
  let url = process.env.SUPABASE_URL || '';
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (url && serviceRoleKey) return { url, serviceRoleKey };

  try {
    const out = execSync('supabase status --output json', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const status = JSON.parse(out) as Record<string, string>;
    url = url || status.API_URL || 'http://localhost:54321';
    serviceRoleKey = serviceRoleKey || status.SERVICE_ROLE_KEY || '';
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
    if (status.ANON_KEY && !process.env.SUPABASE_ANON_KEY) {
      process.env.SUPABASE_ANON_KEY = status.ANON_KEY;
    }
  } catch {
    // CLI missing or supabase not running — caller will surface a clear error.
  }
  return { url, serviceRoleKey };
}

async function checkSupabase(): Promise<void> {
  const { url, serviceRoleKey } = resolveSupabaseEnv();
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set and `supabase status` ' +
        "couldn't supply them. Run `supabase start` first, or export the vars manually.",
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from('organizations').select('id').limit(1);
  if (error) {
    throw new Error(
      `Supabase health check failed: ${error.message}. ` +
        `Run \`supabase start\` and ensure migrations are applied.`,
    );
  }
}

async function checkRedis(): Promise<void> {
  const client = createRedisClient({ url: REDIS_URL });
  try {
    await client.connect();
    await client.ping();
    await client.disconnect();
  } catch (err) {
    throw new Error(`Redis health check failed: ${err}. Start redis-server.`);
  }
}

async function checkStripe(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) {
    throw new Error(
      'STRIPE_SECRET_KEY must be a sk_test_* key (got ' +
        `${key?.slice(0, 8) ?? '<unset>'}). Set it before running real-stripe tests.`,
    );
  }
  const connectAccountId = process.env.STRIPE_TEST_CONNECT_ACCOUNT;
  if (!connectAccountId) {
    throw new Error(
      'STRIPE_TEST_CONNECT_ACCOUNT must be set (acct_...) for real-stripe tests.',
    );
  }
  const stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' });

  // 1. Resolve the platform account that owns the API key. `accounts.retrieve()`
  // with no ID returns "the current account" — i.e. the platform.
  const platform = await stripe.accounts.retrieve();
  if (platform.id === connectAccountId) {
    throw new Error(
      `STRIPE_TEST_CONNECT_ACCOUNT (${connectAccountId}) is the same as the ` +
        `platform account that owns STRIPE_SECRET_KEY. Connect requires a ` +
        `SEPARATE merchant account. Create one at ` +
        `https://dashboard.stripe.com/test/connect/accounts/overview and use ` +
        `that acct_... ID instead.`,
    );
  }

  // 2. Confirm the connected account is reachable (auth + ID valid).
  const connected = await stripe.accounts.retrieve(connectAccountId);

  // 3. Confirm it has charges_enabled — without this, subscription.create
  // fails with confusing errors about the platform.
  if (!connected.charges_enabled) {
    throw new Error(
      `Connected account ${connectAccountId} has charges_enabled=false. ` +
        `Onboarding must finish (test values: DOB 1901-01-01, address ` +
        `'address_full_match', SSN 0000) before tests can charge against it.`,
    );
  }
  console.log(
    `  · platform=${platform.id}, connected=${connected.id} (charges_enabled=${connected.charges_enabled})`,
  );
}

export default async function globalSetup(): Promise<void> {
  console.log('\n🔍 Real-Stripe integration setup — checking services...\n');
  try {
    await Promise.all([checkSupabase(), checkRedis(), checkStripe()]);
    console.log('  ✓ Supabase reachable');
    console.log('  ✓ Redis reachable');
    console.log('  ✓ Stripe API + Connect account reachable');
    console.log('');
  } catch (err) {
    console.error(`\n❌ Service check failed:\n  ${err}\n`);
    process.exit(1);
  }
}
