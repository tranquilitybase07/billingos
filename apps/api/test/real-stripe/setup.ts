/**
 * NestJS module bootstrap for real-Stripe-test-mode integration tests.
 *
 * Mirrors `test/integration/setup.ts` except: NO override of the Stripe
 * client. The real `StripeService` instance reads `STRIPE_SECRET_KEY` from
 * env and talks to api.stripe.com directly.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import * as redisStore from 'cache-manager-redis-store';
import { INestApplication } from '@nestjs/common';

import { SupabaseModule } from '../../src/supabase/supabase.module';
import { RedisModule } from '../../src/redis/redis.module';
import { QueueModule } from '../../src/queue/queue.module';

import { StripeModule } from '../../src/stripe/stripe.module';
import { SubscriptionsModule } from '../../src/subscriptions/subscriptions.module';
import { CustomersModule } from '../../src/customers/customers.module';
import { ProductsModule } from '../../src/products/products.module';
import { FeaturesModule } from '../../src/features/features.module';
import { BillingModule } from '../../src/billing/billing.module';
import { DiscountsModule } from '../../src/discounts/discounts.module';
import { AuthModule } from '../../src/auth/auth.module';
import { CheckoutModule } from '../../src/v1/checkout/checkout.module';

import { cleanupDatabase, flushRedis } from '../integration/db-helpers';
import { SupabaseService } from '../../src/supabase/supabase.service';

export interface RealStripeTestContext {
  app: INestApplication;
  module: TestingModule;
  cleanup: () => Promise<void>;
}

export async function createRealStripeTestModule(): Promise<RealStripeTestContext> {
  // Real Stripe key MUST come from env. Refuse to boot otherwise — tests
  // running against api.stripe.com without a sk_test_ key would either
  // 401 or, worse, hit live mode.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !stripeKey.startsWith('sk_test_')) {
    throw new Error(
      'STRIPE_SECRET_KEY must be a sk_test_* key for real-stripe tests. ' +
        `Got: ${stripeKey?.slice(0, 8) ?? '<unset>'}`,
    );
  }

  // Other env defaults — supabase/redis can stay local.
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SUPABASE_URL =
    process.env.SUPABASE_URL || 'http://localhost:54321';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
  process.env.STRIPE_WEBHOOK_SECRET =
    process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_realstripe';
  process.env.SUPABASE_JWT_SECRET =
    process.env.SUPABASE_JWT_SECRET ||
    'super-secret-jwt-token-with-at-least-32-characters-long';

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      ScheduleModule.forRoot(),
      CacheModule.registerAsync({
        isGlobal: true,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          store: redisStore,
          host: configService.get('REDIS_HOST', 'localhost'),
          port: parseInt(configService.get('REDIS_PORT', '6379'), 10),
          ttl: 300,
          max: 1000,
        }),
        inject: [ConfigService],
      }),
      RedisModule,
      SupabaseModule,
      AuthModule,
      StripeModule,
      SubscriptionsModule,
      CustomersModule,
      ProductsModule,
      FeaturesModule,
      BillingModule,
      DiscountsModule,
      QueueModule,
      CheckoutModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  // afterAll path: nuclear cleanup wipes run-scoped tables + auth users so
  // the next CI run starts clean. Inline so the early-return in catch blocks
  // can still close the app.
  const cleanup = async () => {
    try {
      await cleanupDatabase(moduleRef);
      await flushRedis();
    } finally {
      await app.close();
    }
  };

  return { app, module: moduleRef, cleanup };
}

/**
 * Per-test cleanup. Wipes everything that accumulates per scenario
 * (subs, grants, products, customers, etc.) while preserving the
 * run-scoped tables (organizations, accounts, users, user_organizations).
 *
 * Why preserve them: real-Stripe tests must reuse a single Connect account
 * across every test, and `accounts.stripe_id` has a partial unique index
 * `WHERE deleted_at IS NULL`. Wiping the run-scoped account and re-inserting
 * with the same stripe_id collides on that index.
 */
export async function cleanBetweenRealStripeTests(
  module: TestingModule,
): Promise<void> {
  const supabase = module.get(SupabaseService).getClient();

  // Children → parents. Two scopes deliberately preserved:
  //   Run-scoped: organizations, accounts, users, user_organizations
  //   Suite-scoped: products, product_prices, product_features, features
  //                 (set up once in beforeAll, reused across tests
  // Wiping suite-scoped tables forces every test to re-create products in
  // Stripe — slow, and races on the BOS unique constraint.
  const perTestTables = [
    'webhook_events',
    'refunds',
    'payment_intents',
    'feature_grants',
    'usage_records',
    'subscription_changes',
    'subscriptions',
    'checkout_metadata',
    'checkout_sessions',
    'portal_sessions',
    'session_tokens',
    'api_keys',
    'idempotency_keys',
    'discount_products',
    'discounts',
    'customers',
    'stripe_sync_events',
    'trial_history',
  ];

  for (const table of perTestTables) {
    try {
      await (supabase as any)
        .from(table)
        .delete()
        .gte('created_at', '1970-01-01T00:00:00.000Z');
    } catch {
      // Best-effort — schema differences across migrations would no-op here.
    }
  }

  await flushRedis();
}

/**
 * Full nuclear cleanup. Used by the suite's afterAll to wipe everything
 * (including run-scoped rows + auth users) before tearing down the app.
 */
export async function nukeRealStripeDb(module: TestingModule): Promise<void> {
  await cleanupDatabase(module);
  await flushRedis();
}
