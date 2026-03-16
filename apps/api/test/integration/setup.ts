/**
 * Integration test setup — bootstraps the NestJS module with real infrastructure:
 * - Real Supabase (local Postgres with all migrations)
 * - stripe-mock (localhost:12111)
 * - Real Redis
 *
 * Usage:
 *   const { app, module } = await createIntegrationTestModule();
 *   const checkoutService = module.get(CheckoutService);
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import * as redisStore from 'cache-manager-redis-store';
import { INestApplication } from '@nestjs/common';

// Infrastructure
import { SupabaseModule } from '../../src/supabase/supabase.module';
import { RedisModule } from '../../src/redis/redis.module';
import { QueueModule } from '../../src/queue/queue.module';

// Feature modules
import { StripeModule } from '../../src/stripe/stripe.module';
import { StripeService } from '../../src/stripe/stripe.service';
import { SubscriptionsModule } from '../../src/subscriptions/subscriptions.module';
import { CustomersModule } from '../../src/customers/customers.module';
import { ProductsModule } from '../../src/products/products.module';
import { FeaturesModule } from '../../src/features/features.module';
import { BillingModule } from '../../src/billing/billing.module';
import { DiscountsModule } from '../../src/discounts/discounts.module';
import { AuthModule } from '../../src/auth/auth.module';

// Checkout (V1 sub-module)
import { CheckoutModule } from '../../src/v1/checkout/checkout.module';

// Cleanup helpers
import { cleanupDatabase, flushRedis } from './db-helpers';

/**
 * Environment variables for integration tests.
 * Overrides StripeService to point at stripe-mock.
 */
function getIntegrationEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    STRIPE_SECRET_KEY: 'sk_test_integration',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_integration',
    SUPABASE_JWT_SECRET:
      process.env.SUPABASE_JWT_SECRET ||
      'super-secret-jwt-token-with-at-least-32-characters-long',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    // stripe-mock config — StripeService reads STRIPE_SECRET_KEY, but
    // we also need to override the Stripe constructor. See overrideStripeConfig.
    STRIPE_MOCK_HOST: process.env.STRIPE_MOCK_HOST || 'localhost',
    STRIPE_MOCK_PORT: process.env.STRIPE_MOCK_PORT || '12111',
  };
}

export interface IntegrationTestContext {
  app: INestApplication;
  module: TestingModule;
  cleanup: () => Promise<void>;
}

/**
 * Create the integration test NestJS module with real infrastructure.
 */
export async function createIntegrationTestModule(): Promise<IntegrationTestContext> {
  const env = getIntegrationEnv();

  // Set env vars so ConfigService picks them up
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        // Load from process.env (set above)
        ignoreEnvFile: true,
      }),
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
  });

  const module = await moduleBuilder.compile();

  // Override the Stripe instance to point at stripe-mock
  const stripeService = module.get(StripeService);
  const Stripe = (await import('stripe')).default;
  const stripeMockClient = new Stripe('sk_test_integration', {
    apiVersion: '2025-12-15.clover',
    host: env.STRIPE_MOCK_HOST,
    port: parseInt(env.STRIPE_MOCK_PORT, 10),
    protocol: 'http',
  });

  // Replace the private stripe field (cast to bypass TypeScript's private/readonly)
  (stripeService as any).stripe = stripeMockClient;

  const app = module.createNestApplication();
  await app.init();

  const cleanup = async () => {
    await cleanupDatabase(module);
    await flushRedis();
    await app.close();
  };

  return { app, module, cleanup };
}

/**
 * Convenience: clean between tests (without closing the app).
 */
export async function cleanBetweenTests(module: TestingModule): Promise<void> {
  await cleanupDatabase(module);
  await flushRedis();
}
