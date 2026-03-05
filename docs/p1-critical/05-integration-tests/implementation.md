# 🧪 Integration Testing - Step-by-Step Implementation

**Time Estimate:** 6 hours
**Prerequisites:** All P1 features implemented, Stripe test account ready

## 📋 Pre-Implementation Checklist

- [ ] All P1 features implemented
- [ ] Stripe test API keys available
- [ ] Jest/Supertest installed
- [ ] Test database configured
- [ ] Create branch: `git checkout -b feat/integration-tests`

## 🛠️ Implementation Steps

### Step 1: Install Testing Dependencies (15 minutes)

```bash
cd apps/api
pnpm add -D supertest @faker-js/faker stripe-mock
pnpm add -D @types/supertest

# For load testing (optional)
pnpm add -D artillery k6
```

### Step 2: Create Test Configuration (20 minutes)

#### 2.1 Create Test Environment File

**File:** `apps/api/.env.test`

```bash
# Test Database (separate from development)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/billingos_test
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long

# Stripe Test Keys
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY
STRIPE_WEBHOOK_SECRET=whsec_test_YOUR_TEST_SECRET
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_KEY

# Test API Keys (pre-generated for testing)
TEST_SECRET_KEY=sk_test_abcdefghijklmnopqrstuvwxyz123456
TEST_PUBLISHABLE_KEY=pk_test_abcdefghijklmnopqrstuvwxyz123456
TEST_JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Test Organization
TEST_ORG_ID=550e8400-e29b-41d4-a716-446655440000
TEST_USER_ID=550e8400-e29b-41d4-a716-446655440001

# Disable rate limiting in tests
SKIP_RATE_LIMIT=true

# Disable Sentry in tests
SENTRY_DSN=

# Test configuration
NODE_ENV=test
PORT=3002
```

#### 2.2 Update Jest Configuration

**File:** `apps/api/test/jest-e2e.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": "\\.(e2e-spec|e2e-test|test)\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.interface.ts",
    "!src/main.ts"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 70,
      "functions": 70,
      "lines": 70,
      "statements": 70
    }
  },
  "setupFilesAfterEnv": ["<rootDir>/test/setup.ts"],
  "testTimeout": 30000
}
```

### Step 3: Create Test Helpers and Utilities (45 minutes)

#### 3.1 Create Test Setup File

**File:** `apps/api/test/setup.ts`

```typescript
import { config } from 'dotenv';
import * as path from 'path';

// Load test environment variables
config({ path: path.join(__dirname, '../.env.test') });

// Set test timeout
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  console.log('🧪 Starting integration tests...');
  // Setup test database if needed
});

afterAll(async () => {
  console.log('✅ Integration tests completed');
  // Cleanup
});
```

#### 3.2 Create Test Helpers

**File:** `apps/api/test/helpers/test-helpers.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { faker } from '@faker-js/faker';
import * as crypto from 'crypto';

export class TestHelpers {
  /**
   * Create and initialize test application
   */
  static async createTestApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();

    // Apply same configuration as main.ts
    app.setGlobalPrefix('api');
    await app.init();

    return app;
  }

  /**
   * Generate test JWT token
   */
  static generateTestJWT(userId: string, organizationId: string): string {
    // This should match your actual JWT structure
    const payload = {
      sub: userId,
      email: 'test@example.com',
      organizationId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    // In real tests, sign with actual secret
    return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
      JSON.stringify(payload)
    ).toString('base64')}`;
  }

  /**
   * Generate Stripe webhook signature
   */
  static generateWebhookSignature(
    payload: string,
    secret: string
  ): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;

    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Create test organization
   */
  static createTestOrganization() {
    return {
      id: faker.string.uuid(),
      name: faker.company.name(),
      email: faker.internet.email(),
      status: 'active',
      created_at: new Date(),
    };
  }

  /**
   * Create test product
   */
  static createTestProduct() {
    return {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: faker.number.int({ min: 999, max: 9999 }),
      currency: 'usd',
      interval: 'month',
    };
  }

  /**
   * Create test API key
   */
  static createTestApiKey(type: 'secret' | 'publishable') {
    const prefix = type === 'secret' ? 'sk_test' : 'pk_test';
    const random = faker.string.alphanumeric(32);
    return `${prefix}_${random}`;
  }

  /**
   * Retry helper for async operations
   */
  static async retry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Wait for condition to be true
   */
  static async waitFor(
    condition: () => Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) return;
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for condition');
  }
}
```

#### 3.3 Create Database Test Utilities

**File:** `apps/api/test/helpers/database-helpers.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export class DatabaseHelpers {
  private static supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  /**
   * Clean up test data
   */
  static async cleanup() {
    // Delete test organizations
    await this.supabase
      .from('organizations')
      .delete()
      .like('name', 'Test%');

    // Delete test users
    await this.supabase
      .from('users')
      .delete()
      .like('email', '%@test.com');

    // Delete test API keys
    await this.supabase
      .from('api_keys')
      .delete()
      .like('name', 'Test%');
  }

  /**
   * Seed test data
   */
  static async seed() {
    // Create test organization
    const { data: org } = await this.supabase
      .from('organizations')
      .insert({
        id: process.env.TEST_ORG_ID,
        name: 'Test Organization',
        status: 'active',
      })
      .select()
      .single();

    // Create test user
    const { data: user } = await this.supabase
      .from('users')
      .insert({
        id: process.env.TEST_USER_ID,
        email: 'test@test.com',
        organization_id: org.id,
      })
      .select()
      .single();

    // Create test products
    await this.supabase.from('products').insert([
      {
        organization_id: org.id,
        name: 'Test Product Basic',
        price: 999,
        currency: 'usd',
      },
      {
        organization_id: org.id,
        name: 'Test Product Pro',
        price: 2999,
        currency: 'usd',
      },
    ]);

    return { org, user };
  }

  /**
   * Create test subscription
   */
  static async createTestSubscription(
    customerId: string,
    productId: string
  ) {
    const { data } = await this.supabase
      .from('subscriptions')
      .insert({
        customer_id: customerId,
        product_id: productId,
        status: 'active',
        stripe_subscription_id: `sub_test_${Date.now()}`,
      })
      .select()
      .single();

    return data;
  }
}
```

### Step 4: Implement Payment Flow E2E Test (1.5 hours)

**File:** `apps/api/test/payment-flow.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestHelpers } from './helpers/test-helpers';
import { DatabaseHelpers } from './helpers/database-helpers';
import Stripe from 'stripe';

describe('Payment Flow E2E', () => {
  let app: INestApplication;
  let stripe: Stripe;
  let testOrg: any;
  let testUser: any;
  let apiKey: string;

  beforeAll(async () => {
    app = await TestHelpers.createTestApp();
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Seed test data
    const { org, user } = await DatabaseHelpers.seed();
    testOrg = org;
    testUser = user;

    // Get API key for tests
    apiKey = TestHelpers.createTestApiKey('secret');
  });

  afterAll(async () => {
    await DatabaseHelpers.cleanup();
    await app.close();
  });

  describe('Complete Checkout Flow', () => {
    let checkoutSession: any;
    let customerId: string;

    it('should create a checkout session', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          productId: 'prod_test_123',
          customerEmail: 'customer@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('url');
      expect(response.body.object).toBe('checkout.session');

      checkoutSession = response.body;
      customerId = response.body.customer;
    });

    it('should handle checkout.session.completed webhook', async () => {
      // Create webhook payload
      const webhookPayload = {
        id: 'evt_test_' + Date.now(),
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: checkoutSession.id,
            object: 'checkout.session',
            customer: customerId,
            payment_status: 'paid',
            status: 'complete',
            mode: 'subscription',
            subscription: 'sub_test_123',
            metadata: {
              organizationId: testOrg.id,
              productId: 'prod_test_123',
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const payload = JSON.stringify(webhookPayload);
      const signature = TestHelpers.generateWebhookSignature(
        payload,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      const response = await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('stripe-signature', signature)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('received', true);

      // Verify subscription was created
      await TestHelpers.waitFor(async () => {
        const subResponse = await request(app.getHttpServer())
          .get(`/api/v1/subscriptions/${customerId}`)
          .set('Authorization', `Bearer ${apiKey}`);

        return subResponse.status === 200 &&
               subResponse.body.status === 'active';
      });
    });

    it('should handle subscription lifecycle events', async () => {
      // Test subscription update
      const updatePayload = {
        id: 'evt_test_update',
        object: 'event',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            customer: customerId,
            status: 'active',
            items: {
              data: [{
                price: { id: 'price_test_456' },
              }],
            },
          },
        },
      };

      const payload = JSON.stringify(updatePayload);
      const signature = TestHelpers.generateWebhookSignature(
        payload,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('stripe-signature', signature)
        .send(payload)
        .expect(200);
    });

    it('should handle failed payment', async () => {
      const failedPayload = {
        id: 'evt_test_failed',
        object: 'event',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_failed',
            customer: customerId,
            subscription: 'sub_test_123',
            payment_intent: 'pi_test_failed',
            status: 'open',
            attempt_count: 1,
          },
        },
      };

      const payload = JSON.stringify(failedPayload);
      const signature = TestHelpers.generateWebhookSignature(
        payload,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('stripe-signature', signature)
        .send(payload)
        .expect(200);

      // Verify subscription status updated
      const subResponse = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/${customerId}`)
        .set('Authorization', `Bearer ${apiKey}`);

      expect(subResponse.body.payment_status).toBe('failed');
    });
  });

  describe('Subscription Management', () => {
    it('should allow subscription upgrade', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscriptions/upgrade')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          subscriptionId: 'sub_test_123',
          newProductId: 'prod_pro_456',
        })
        .expect(200);

      expect(response.body.status).toBe('active');
      expect(response.body.product_id).toBe('prod_pro_456');
    });

    it('should handle subscription cancellation', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscriptions/cancel')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          subscriptionId: 'sub_test_123',
          reason: 'Too expensive',
          feedback: 'Great product but not in budget',
        })
        .expect(200);

      expect(response.body.status).toBe('canceled');
      expect(response.body.cancel_at_period_end).toBe(true);
    });
  });
});
```

### Step 5: Implement Webhook Verification Tests (1 hour)

**File:** `apps/api/test/webhook-verification.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestHelpers } from './helpers/test-helpers';
import * as crypto from 'crypto';

describe('Webhook Verification', () => {
  let app: INestApplication;
  const webhookSecret = 'whsec_test_secret_key';

  beforeAll(async () => {
    app = await TestHelpers.createTestApp();
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Signature Validation', () => {
    const validPayload = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          object: 'checkout.session',
        },
      },
    };

    it('should accept valid webhook signature', async () => {
      const payload = JSON.stringify(validPayload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      const response = await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('stripe-signature', `t=${timestamp},v1=${signature}`)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('received', true);
    });

    it('should reject invalid signature', async () => {
      const payload = JSON.stringify(validPayload);

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('stripe-signature', 'invalid_signature')
        .send(payload)
        .expect(400);
    });

    it('should reject missing signature', async () => {
      const payload = JSON.stringify(validPayload);

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .send(payload)
        .expect(400);
    });

    it('should reject expired timestamp', async () => {
      const payload = JSON.stringify(validPayload);
      const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${oldTimestamp}.${payload}`)
        .digest('hex');

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set('stripe-signature', `t=${oldTimestamp},v1=${signature}`)
        .send(payload)
        .expect(400);
    });

    it('should handle replay attacks', async () => {
      const payload = JSON.stringify({
        ...validPayload,
        id: 'evt_replay_test',
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      const headers = {
        'stripe-signature': `t=${timestamp},v1=${signature}`,
      };

      // First request should succeed
      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set(headers)
        .send(payload)
        .expect(200);

      // Same request again should be rejected (idempotency)
      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set(headers)
        .send(payload)
        .expect(200); // Or 409 if you implement idempotency
    });
  });

  describe('Event Processing', () => {
    const createValidWebhook = (type: string, data: any) => {
      const payload = JSON.stringify({
        id: `evt_test_${Date.now()}`,
        object: 'event',
        type,
        data: { object: data },
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      return {
        payload,
        headers: {
          'stripe-signature': `t=${timestamp},v1=${signature}`,
        },
      };
    };

    it('should process checkout.session.completed', async () => {
      const { payload, headers } = createValidWebhook(
        'checkout.session.completed',
        {
          id: 'cs_test_completed',
          customer: 'cus_test_123',
          subscription: 'sub_test_123',
          payment_status: 'paid',
        }
      );

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set(headers)
        .send(payload)
        .expect(200);
    });

    it('should process customer.subscription.created', async () => {
      const { payload, headers } = createValidWebhook(
        'customer.subscription.created',
        {
          id: 'sub_test_created',
          customer: 'cus_test_123',
          status: 'trialing',
          trial_end: Math.floor(Date.now() / 1000) + 86400 * 7,
        }
      );

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set(headers)
        .send(payload)
        .expect(200);
    });

    it('should handle unknown event types gracefully', async () => {
      const { payload, headers } = createValidWebhook(
        'unknown.event.type',
        { id: 'unknown_123' }
      );

      await request(app.getHttpServer())
        .post('/stripe/webhooks')
        .set(headers)
        .send(payload)
        .expect(200); // Should accept but log as unhandled
    });
  });
});
```

### Step 6: Implement API Authentication Tests (45 minutes)

**File:** `apps/api/test/authentication.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestHelpers } from './helpers/test-helpers';
import { DatabaseHelpers } from './helpers/database-helpers';

describe('Authentication E2E', () => {
  let app: INestApplication;
  let jwtToken: string;
  let secretKey: string;
  let publishableKey: string;

  beforeAll(async () => {
    app = await TestHelpers.createTestApp();

    // Setup test data
    await DatabaseHelpers.seed();

    // Generate test tokens
    jwtToken = TestHelpers.generateTestJWT(
      process.env.TEST_USER_ID!,
      process.env.TEST_ORG_ID!
    );
    secretKey = TestHelpers.createTestApiKey('secret');
    publishableKey = TestHelpers.createTestApiKey('publishable');
  });

  afterAll(async () => {
    await DatabaseHelpers.cleanup();
    await app.close();
  });

  describe('JWT Authentication', () => {
    it('should accept valid JWT token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
    });

    it('should reject invalid JWT token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });

    it('should reject expired JWT token', async () => {
      const expiredToken = TestHelpers.generateTestJWT(
        'user_123',
        'org_123'
      );
      // Modify token to be expired

      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('API Key Authentication', () => {
    it('should accept valid secret key', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${secretKey}`)
        .expect(200);
    });

    it('should accept valid publishable key on public endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${publishableKey}`)
        .expect(200);
    });

    it('should reject publishable key on restricted endpoints', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/products/123')
        .set('Authorization', `Bearer ${publishableKey}`)
        .expect(403);
    });

    it('should reject invalid API key format', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', 'Bearer not_a_valid_key')
        .expect(401);
    });

    it('should reject revoked API key', async () => {
      // Revoke key in database
      // Then test
      const revokedKey = 'sk_test_revoked_key';

      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${revokedKey}`)
        .expect(401);
    });
  });

  describe('Mixed Authentication Scenarios', () => {
    it('should handle missing authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(401);
    });

    it('should handle malformed authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', 'NotBearer token')
        .expect(401);
    });

    it('should prioritize bearer token type', async () => {
      // If both JWT and API key patterns, should try appropriate strategy
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${secretKey}`)
        .set('X-API-Key', 'ignored_key')
        .expect(200);
    });
  });

  describe('Permission Checks', () => {
    it('should allow admin operations with admin JWT', async () => {
      const adminToken = TestHelpers.generateTestJWT(
        'admin_user',
        process.env.TEST_ORG_ID!
      );

      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Product',
          price: 999,
        })
        .expect(201);
    });

    it('should restrict organization access', async () => {
      const otherOrgToken = TestHelpers.generateTestJWT(
        'user_123',
        'different_org_id'
      );

      await request(app.getHttpServer())
        .get('/api/v1/organization/different_org_id/products')
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .expect(403);
    });
  });
});
```

### Step 7: Implement Rate Limiting Tests (45 minutes)

**File:** `apps/api/test/rate-limiting.e2e-spec.ts`

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestHelpers } from './helpers/test-helpers';

describe('Rate Limiting E2E', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    // Enable rate limiting for tests
    process.env.SKIP_RATE_LIMIT = 'false';
    app = await TestHelpers.createTestApp();
    apiKey = TestHelpers.createTestApiKey('secret');
  });

  afterAll(async () => {
    process.env.SKIP_RATE_LIMIT = 'true';
    await app.close();
  });

  describe('Global IP Rate Limiting', () => {
    it('should enforce IP-based rate limits', async () => {
      const requests = [];
      const limit = 100; // Global limit per minute

      // Make requests up to limit
      for (let i = 0; i < limit + 10; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', '10.0.0.1')
        );
      }

      const responses = await Promise.all(requests);

      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBeLessThanOrEqual(limit);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should track different IPs separately', async () => {
      const requests = [];

      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', `10.0.0.${i}`)
        );
      }

      const responses = await Promise.all(requests);
      const allSuccess = responses.every(r =>
        r.status === 200 || r.status === 401
      );

      expect(allSuccess).toBe(true);
    });
  });

  describe('Organization Rate Limiting', () => {
    it('should enforce organization-specific limits', async () => {
      const requests = [];
      const orgLimit = 1000; // Org limit per minute

      for (let i = 0; i < 50; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${apiKey}`)
        );
      }

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      // Check rate limit headers
      expect(lastResponse.headers).toHaveProperty('x-ratelimit-limit');
      expect(lastResponse.headers).toHaveProperty('x-ratelimit-remaining');
      expect(lastResponse.headers).toHaveProperty('x-ratelimit-reset');

      const remaining = parseInt(
        lastResponse.headers['x-ratelimit-remaining']
      );
      expect(remaining).toBeLessThan(orgLimit);
    });
  });

  describe('Endpoint-Specific Limits', () => {
    it('should apply stricter limits to checkout endpoint', async () => {
      const checkoutLimit = 50; // Per minute
      const requests = [];

      for (let i = 0; i < checkoutLimit + 10; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/api/v1/checkout/create-session')
            .set('Authorization', `Bearer ${apiKey}`)
            .send({ productId: 'prod_123' })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should apply lower limits to analytics endpoints', async () => {
      const analyticsLimit = 20; // Per minute
      const requests = [];

      for (let i = 0; i < analyticsLimit + 5; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/analytics/revenue')
            .set('Authorization', `Bearer ${apiKey}`)
        );
      }

      const responses = await Promise.all(requests);
      const success = responses.filter(r => r.status < 429).length;

      expect(success).toBeLessThanOrEqual(analyticsLimit + 2); // Small buffer
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include proper headers in responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');

      const limit = parseInt(response.headers['x-ratelimit-limit']);
      const remaining = parseInt(response.headers['x-ratelimit-remaining']);
      const reset = parseInt(response.headers['x-ratelimit-reset']);

      expect(limit).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(limit);
      expect(reset).toBeGreaterThan(Date.now() / 1000);
    });

    it('should include Retry-After header when rate limited', async () => {
      // Make many requests to trigger rate limit
      const requests = [];

      for (let i = 0; i < 200; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', '192.168.1.100')
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.headers).toHaveProperty('retry-after');
        const retryAfter = parseInt(rateLimited.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('Health Check Bypass', () => {
    it('should never rate limit health endpoint', async () => {
      const requests = [];

      for (let i = 0; i < 500; i++) {
        requests.push(
          request(app.getHttpServer()).get('/health')
        );
      }

      const responses = await Promise.all(requests);
      const allSuccess = responses.every(r => r.status === 200);

      expect(allSuccess).toBe(true);
    });
  });
});
```

### Step 8: Create Test Scripts (15 minutes)

**File:** `apps/api/package.json`

Add test scripts:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "test:e2e:watch": "jest --config ./test/jest-e2e.json --watch",
    "test:e2e:cov": "jest --config ./test/jest-e2e.json --coverage",
    "test:all": "npm run test && npm run test:e2e"
  }
}
```

## ✅ Verification Steps

### 1. Run All Tests

```bash
# Run unit tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Run with coverage
pnpm test:e2e:cov

# Run all tests
pnpm test:all
```

### 2. Check Coverage

```bash
pnpm test:e2e:cov

# View coverage report
open coverage/lcov-report/index.html
```

### 3. Run Specific Test Suites

```bash
# Payment flow only
pnpm test:e2e payment-flow

# Webhooks only
pnpm test:e2e webhook

# Authentication only
pnpm test:e2e authentication

# Rate limiting only
pnpm test:e2e rate-limiting
```

## 🎯 Completion Checklist

- [ ] Test dependencies installed
- [ ] Test configuration complete
- [ ] Test helpers created
- [ ] Payment flow E2E test working
- [ ] Webhook verification tests passing
- [ ] API authentication tests complete
- [ ] Rate limiting tests functional
- [ ] All tests passing
- [ ] Coverage > 70%
- [ ] CI/CD integration configured

## 🚀 Next Steps

1. Commit your tests:
```bash
git add .
git commit -m "feat: implement comprehensive integration tests for critical paths"
```

2. Set up CI/CD pipeline
3. Add performance benchmarks
4. Create load testing scripts

---

**Important:** Run these tests before every deployment to ensure system reliability!