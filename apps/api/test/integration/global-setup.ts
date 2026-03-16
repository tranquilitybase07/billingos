/**
 * Global setup for integration tests.
 * Verifies that all required services (Supabase, stripe-mock, Redis) are reachable
 * before any tests run.
 */
import { createClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STRIPE_MOCK_HOST = process.env.STRIPE_MOCK_HOST || 'localhost';
const STRIPE_MOCK_PORT = parseInt(process.env.STRIPE_MOCK_PORT || '12111', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function checkSupabase(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Simple health check — query a table that should exist after migrations
  const { error } = await supabase.from('organizations').select('id').limit(1);

  if (error) {
    throw new Error(
      `Supabase health check failed: ${error.message}. ` +
        `Is Supabase running? (supabase start)`,
    );
  }
}

async function checkStripeMock(): Promise<void> {
  const url = `http://${STRIPE_MOCK_HOST}:${STRIPE_MOCK_PORT}/v1/customers`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk_test_integration',
      },
    });
    if (!response.ok) {
      throw new Error(`stripe-mock returned ${response.status}`);
    }
  } catch (err) {
    throw new Error(
      `stripe-mock health check failed: ${err}. ` +
        `Is stripe-mock running on port ${STRIPE_MOCK_PORT}?`,
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
    throw new Error(
      `Redis health check failed: ${err}. ` +
        `Is Redis running? (redis-server or brew services start redis)`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  console.log('\n🔍 Integration test global setup — checking services...\n');

  try {
    await Promise.all([checkSupabase(), checkStripeMock(), checkRedis()]);
    console.log('  ✓ Supabase reachable');
    console.log('  ✓ stripe-mock reachable');
    console.log('  ✓ Redis reachable');
    console.log('\n');
  } catch (err) {
    console.error(`\n❌ Service check failed:\n  ${err}\n`);
    process.exit(1);
  }
}
