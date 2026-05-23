const REQUIRED_VARS = [
  'NODE_ENV',
  'PORT',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'REDIS_URL',
] as const;

export function assertTestEnv(): void {
  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars in apps/api/.env.test:\n  - ${missing.join('\n  - ')}\n\n` +
        `Fill them in (copy Stripe keys from apps/api/.env) before running integration tests.`,
    );
  }

  if (process.env.NODE_ENV !== 'sandbox') {
    throw new Error(
      `NODE_ENV must be 'sandbox' for integration tests (got '${process.env.NODE_ENV}'). ` +
        `Sandbox mode unlocks createTestAccountWithBypass() for per-test Connect accounts.`,
    );
  }

  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a test-mode key (sk_test_*). Refusing to run integration tests against live Stripe.`,
    );
  }
}
