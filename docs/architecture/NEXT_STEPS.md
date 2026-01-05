# BillingOS - Next Implementation Steps

**Date:** 2026-01-02
**Status:** Ready to implement
**Related:** See `data-architecture-strategy.md` for full architecture decisions

---

## TL;DR - What You Asked, What We Decided

### Your Questions:
1. **What do we store in our DB vs Stripe?**
2. **Do we call Stripe APIs directly from SDK or through our backend?**
3. **How does Polar handle this?**

### Our Answers:

#### 1. Database Strategy: Store EVERYTHING, Stripe is NOT Source of Truth

**Store in Database:**
- ✅ Subscriptions (100% managed in our DB, NO Stripe Subscriptions API)
- ✅ Products & Prices (NO Stripe Product/Price sync)
- ✅ Entitlements/Benefits (custom feature gating)
- ✅ Usage Events (metered billing events)
- ✅ Customers (with `stripe_customer_id` reference only)

**Use Stripe For:**
- ✅ Payment processing (PaymentIntents)
- ✅ Customer management (stripe_customer_id for payments)
- ✅ Payment methods (SetupIntents, Cards)
- ✅ Tax calculation (Invoices - optional)
- ✅ Connect accounts (already done!)

**DON'T Use Stripe For:**
- ❌ Subscription management (Stripe Subscriptions API)
- ❌ Product/Price storage
- ❌ Usage metering (Stripe Billing Meter API)
- ❌ Entitlements

**Why?** Polar recently REMOVED all Stripe subscription/product/price IDs from their database (December 2025). They manage billing 100% in their database and use Stripe ONLY for payment processing. This gives them:
- Full control over billing logic
- Support for features Stripe doesn't offer
- No vendor lock-in
- Faster queries (no external API calls)

#### 2. SDK Strategy: Backend as Middleware

**Architecture:**
```
Merchant App → @billingos/sdk → BillingOS API → PostgreSQL (+ Stripe when needed)
```

**NOT:**
```
Merchant App → @billingos/sdk → Stripe API directly ❌
```

**Why?**
- Unified authentication (single access token)
- Custom business logic layer
- Multi-tenant isolation
- Support features beyond Stripe
- Merchants never touch Stripe APIs

**Example:**
```typescript
// Merchant's code
import { BillingOS } from '@billingos/sdk';

const billingos = new BillingOS({
  accessToken: process.env.BILLINGOS_ACCESS_TOKEN
});

// This calls BillingOS backend, which then:
// 1. Stores subscription in PostgreSQL
// 2. Creates PaymentIntent in Stripe
// 3. Returns subscription to merchant
const subscription = await billingos.subscriptions.create({
  customerId: 'cust_xxx',
  productId: 'prod_xxx'
});

// This ONLY queries PostgreSQL (no Stripe call)
const benefits = await billingos.benefitGrants.list({
  customerId: 'cust_xxx'
});
```

#### 3. Polar's Implementation (What We Learned)

**Key Findings from Polar Codebase:**

1. **Removed Stripe IDs (Dec 2025):**
   - Deleted `subscriptions.stripe_subscription_id`
   - Deleted `products.stripe_product_id`
   - Deleted `product_prices.stripe_price_id`

2. **Only 3 Stripe IDs Remain:**
   - `customers.stripe_customer_id` - For payments
   - `accounts.stripe_id` - For Connect accounts
   - `subscription.legacy_stripe_subscription_id` - For migrated subs only

3. **Webhook Strategy:**
   - Store full Stripe event in JSONB
   - Process asynchronously via task queue
   - NO reverse sync to Stripe

4. **SDK Pattern:**
   - SDK calls Polar backend (NOT Stripe)
   - Backend handles all Stripe communication
   - OpenAPI-generated SDKs (TypeScript, Python, Go)

---

## What's Already Done ✅

### 1. Stripe Connect Integration
- Account creation: `apps/api/src/account/account.service.ts`
- Onboarding links: `apps/api/src/account/account.service.ts:244`
- Dashboard links: `apps/api/src/account/account.service.ts:296`

### 2. Webhook Infrastructure
- Webhook endpoint: `apps/api/src/stripe/stripe.controller.ts`
- Webhook service: `apps/api/src/stripe/stripe-webhook.service.ts`
- Database table: `webhook_events` (stores full events)
- Idempotency check: `apps/api/src/stripe/stripe-webhook.service.ts:27-38`

### 3. Account Syncing
- `account.updated` webhook handler
- Full account data stored in `accounts.data` JSONB
- Organization status updates based on account state

### 4. Database Foundation
- Supabase local setup
- User authentication (Supabase Auth)
- Organizations table
- User-organization relationships
- Accounts table (Stripe Connect)

---

## What's Next: Implementation Phases

### Phase 1: Database Schema (WEEK 1) 🎯 START HERE

**Goal:** Create database tables for subscriptions, products, customers

**Tasks:**
1. Create `customers` table
   - `id`, `email`, `external_id`, `stripe_customer_id`, `organization_id`, `metadata`
   - Reference: Polar's `/server/polar/models/customer.py`

2. Create `products` table
   - `id`, `name`, `description`, `recurring_interval`, `trial_duration`, `organization_id`, `metadata`
   - Reference: Polar's `/server/polar/models/product.py`

3. Create `product_prices` table (polymorphic pricing)
   - `id`, `product_id`, `amount_type`, `price_amount`, `unit_amount`, `meter_id`, `seat_tiers`
   - Reference: Polar's `/server/polar/models/product_price.py`

4. Create `subscriptions` table
   - `id`, `customer_id`, `product_id`, `amount`, `currency`, `status`, `current_period_start`, `current_period_end`, `metadata`
   - **NO `stripe_subscription_id` column**
   - Reference: Polar's `/server/polar/models/subscription.py`

5. Create `orders` table
   - `id`, `subscription_id`, `customer_id`, `amount`, `stripe_payment_intent_id`, `status`
   - Represents individual charges/invoices

6. Create `payment_methods` table
   - `id`, `customer_id`, `stripe_payment_method_id`, `type`, `last4`, `is_default`

**Files to Create:**
```bash
supabase/migrations/20260103_create_customers_table.sql
supabase/migrations/20260103_create_products_and_prices_tables.sql
supabase/migrations/20260103_create_subscriptions_table.sql
supabase/migrations/20260103_create_orders_table.sql
supabase/migrations/20260103_create_payment_methods_table.sql
```

**How to Start:**
1. Check Polar's schema files listed above
2. Copy table structure, adapt to PostgreSQL/Supabase
3. Run `supabase migration new create_customers_table`
4. Write SQL migration
5. Apply: `supabase db reset` (local)
6. Regenerate types: `supabase gen types typescript --local > packages/shared/types/database.ts`

**Polar Files to Reference:**
- Customer: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/customer.py`
- Product: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/product.py`
- Price: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/product_price.py`
- Subscription: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/subscription.py`

---

### Phase 2: Backend API - Customers & Products (WEEK 2)

**Goal:** Build APIs for merchants to manage customers and products

**Tasks:**
1. Create Customer module
   - `POST /v1/customers` - Create customer (also creates Stripe customer)
   - `GET /v1/customers/:id` - Get customer
   - `GET /v1/customers?organization_id=xxx` - List customers
   - DTO: `CreateCustomerDto`, `UpdateCustomerDto`

2. Create Product module
   - `POST /v1/products` - Create product
   - `GET /v1/products/:id` - Get product
   - `PATCH /v1/products/:id` - Update product
   - `GET /v1/products?organization_id=xxx` - List products

3. Create Price module (nested under products)
   - `POST /v1/products/:id/prices` - Add price to product
   - `GET /v1/products/:id/prices` - List prices for product
   - `PATCH /v1/prices/:id` - Update price

**Implementation Pattern:**
```typescript
// apps/api/src/customer/customer.service.ts
@Injectable()
export class CustomerService {
  async create(dto: CreateCustomerDto): Promise<Customer> {
    // 1. Create Stripe customer
    const stripeCustomer = await this.stripeService.createCustomer({
      email: dto.email,
      metadata: {
        billingos_organization_id: dto.organization_id,
        external_id: dto.external_id
      }
    });

    // 2. Create in our database
    const { data, error } = await this.supabase
      .from('customers')
      .insert({
        email: dto.email,
        external_id: dto.external_id,
        organization_id: dto.organization_id,
        stripe_customer_id: stripeCustomer.id,
        metadata: dto.metadata || {}
      })
      .select()
      .single();

    return data;
  }
}
```

**Files to Create:**
```
apps/api/src/customer/
  ├── customer.module.ts
  ├── customer.service.ts
  ├── customer.controller.ts
  ├── dto/create-customer.dto.ts
  └── entities/customer.entity.ts

apps/api/src/product/
  ├── product.module.ts
  ├── product.service.ts
  ├── product.controller.ts
  └── dto/create-product.dto.ts
```

**Polar Files to Reference:**
- Customer endpoints: `/Users/ankushkumar/Code/payment/billingos/server/polar/customer/endpoints.py`
- Product endpoints: `/Users/ankushkumar/Code/payment/billingos/server/polar/product/endpoints.py`

---

### Phase 3: Backend API - Subscriptions (WEEK 3)

**Goal:** Implement subscription creation and billing logic

**Tasks:**
1. Create Subscription module
   - `POST /v1/subscriptions` - Create subscription from checkout
   - `GET /v1/subscriptions/:id` - Get subscription
   - `GET /v1/subscriptions?customer_id=xxx` - List subscriptions
   - `POST /v1/subscriptions/:id/cancel` - Cancel subscription

2. Implement Billing Scheduler (BullMQ)
   - Job: `billing.charge-subscription`
   - Runs daily to find subscriptions due for renewal
   - Creates PaymentIntent for each subscription
   - Handles retry logic for failed payments

3. Implement Payment Failure Handling
   - Webhook: `payment_intent.payment_failed`
   - Update subscription status to `past_due`
   - Retry 3 times over 10 days
   - After 10 days, cancel subscription

**Key Service Method:**
```typescript
// apps/api/src/subscription/subscription.service.ts
async createFromCheckout(
  customerId: string,
  productId: string,
  paymentMethodId: string
): Promise<Subscription> {
  // 1. Get product and customer
  const product = await this.productService.findOne(productId);
  const customer = await this.customerService.findOne(customerId);

  // 2. Calculate billing dates
  const currentPeriodStart = new Date();
  const currentPeriodEnd = addMonths(currentPeriodStart, 1); // or based on product.recurring_interval

  // 3. Create subscription in OUR database (NO Stripe call)
  const subscription = await this.db.subscriptions.create({
    customer_id: customerId,
    product_id: productId,
    payment_method_id: paymentMethodId,
    amount: product.prices[0].price_amount, // or calculate from selected price
    currency: 'usd',
    status: 'active',
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    recurring_interval: product.recurring_interval,
    metadata: {}
  });

  // 4. Grant benefits
  await this.benefitGrantService.grantForSubscription(subscription.id);

  // 5. Schedule first charge
  await this.billingScheduler.scheduleCharge(subscription.id, currentPeriodStart);

  return subscription;
}

async chargeSubscription(subscriptionId: string): Promise<void> {
  const subscription = await this.findOne(subscriptionId);
  const customer = await this.customerService.findOne(subscription.customer_id);

  // Create PaymentIntent in Stripe
  const paymentIntent = await this.stripeService.createPaymentIntent({
    amount: subscription.amount,
    currency: subscription.currency,
    customer: customer.stripe_customer_id,
    payment_method: subscription.payment_method_id,
    confirm: true,
    metadata: {
      subscription_id: subscription.id,
      billing_period_start: subscription.current_period_start.toISOString()
    }
  });

  // Create order record
  await this.orderService.create({
    subscription_id: subscription.id,
    customer_id: subscription.customer_id,
    amount: subscription.amount,
    stripe_payment_intent_id: paymentIntent.id,
    status: 'processing'
  });

  // Webhook will update when payment succeeds/fails
}
```

**Files to Create:**
```
apps/api/src/subscription/
  ├── subscription.module.ts
  ├── subscription.service.ts
  ├── subscription.controller.ts
  ├── billing-scheduler.service.ts
  └── dto/create-subscription.dto.ts
```

**Polar Files to Reference:**
- Subscription service: `/Users/ankushkumar/Code/payment/billingos/server/polar/subscription/service.py`
- Subscription endpoints: `/Users/ankushkumar/Code/payment/billingos/server/polar/subscription/endpoints.py`

---

### Phase 4: Entitlements & Benefits (WEEK 4)

**Goal:** Implement feature gating system

**Tasks:**
1. Create database tables:
   - `benefits` - Feature definitions (e.g., "API Access", "10GB Storage")
   - `product_benefits` - Link products to benefits
   - `benefit_grants` - Track which customers have which benefits

2. Create Benefit module
   - `POST /v1/benefits` - Create benefit
   - `GET /v1/benefits/:id` - Get benefit
   - Link benefits to products

3. Implement auto-grant/revoke logic
   - When subscription created → grant all product benefits
   - When subscription canceled → revoke all benefits
   - When subscription expires → revoke benefits

4. Create Customer Portal endpoint
   - `GET /v1/customer-portal/benefit-grants` - List customer's granted benefits
   - Used by SDK for feature gating

**Schema:**
```sql
CREATE TABLE benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  type VARCHAR(50) NOT NULL, -- 'feature', 'storage', 'api_quota', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,

  properties JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE product_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  benefit_id UUID NOT NULL REFERENCES benefits(id),

  UNIQUE(product_id, benefit_id)
);

CREATE TABLE benefit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id UUID NOT NULL REFERENCES customers(id),
  member_id UUID REFERENCES users(id), -- For team member-level grants
  benefit_id UUID NOT NULL REFERENCES benefits(id),
  subscription_id UUID REFERENCES subscriptions(id),

  granted_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,

  properties JSONB NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE(subscription_id, member_id, benefit_id)
);
```

**Polar Files to Reference:**
- Benefit model: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/benefit.py`
- Benefit grant model: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/benefit_grant.py`
- Benefit grant service: `/Users/ankushkumar/Code/payment/billingos/server/polar/benefit/grant/service.py`

---

### Phase 5: Usage Metering (WEEK 5)

**Goal:** Track usage events for metered billing

**Tasks:**
1. Create database tables:
   - `meters` - Meter definitions (e.g., "API Calls", "Storage GB")
   - `events` - Raw usage events
   - `customer_meters` - Aggregated usage per customer

2. Create Event Ingestion API
   - `POST /v1/events/ingest` - Bulk event ingestion
   - Accept up to 100 events per request
   - Store in database immediately

3. Create Meter module
   - `POST /v1/meters` - Create meter
   - `GET /v1/meters/:id/quantities` - Query usage

4. Implement aggregation service
   - Background job to aggregate events into `customer_meters`
   - Run every hour or on-demand

**Event Ingestion Example:**
```typescript
// Merchant's SDK usage
await billingos.events.ingest({
  events: [
    {
      name: 'api_call',
      externalCustomerId: 'user_123',
      timestamp: new Date().toISOString(),
      metadata: {
        endpoint: '/api/search',
        credits: 10,
        duration_ms: 145
      }
    }
  ]
});
```

**Schema:**
```sql
CREATE TABLE meters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  name VARCHAR(255) NOT NULL,
  filter JSONB NOT NULL DEFAULT '{}'::jsonb, -- Event filter criteria
  aggregation VARCHAR(50) NOT NULL, -- 'sum', 'count', 'max', 'avg'

  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  name VARCHAR(255) NOT NULL,

  customer_id UUID REFERENCES customers(id),
  external_customer_id VARCHAR(255),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  INDEX idx_events_customer_timestamp (customer_id, timestamp DESC),
  INDEX idx_events_name_timestamp (name, timestamp DESC)
);

CREATE TABLE customer_meters (
  customer_id UUID NOT NULL REFERENCES customers(id),
  meter_id UUID NOT NULL REFERENCES meters(id),
  subscription_id UUID REFERENCES subscriptions(id),

  current_value NUMERIC NOT NULL DEFAULT 0,
  last_billed_value NUMERIC NOT NULL DEFAULT 0,

  PRIMARY KEY (customer_id, meter_id, subscription_id)
);
```

**Polar Files to Reference:**
- Meter model: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/meter.py`
- Event model: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/event.py`
- Event ingestion: `/Users/ankushkumar/Code/payment/billingos/server/polar/event/endpoints.py:376`

---

### Phase 6: SDK Development (WEEK 6)

**Goal:** Auto-generate TypeScript SDK from OpenAPI spec

**Tasks:**
1. Install NestJS Swagger
   - `npm install --save @nestjs/swagger`
   - Configure in `main.ts`
   - Decorate all controllers/DTOs

2. Generate OpenAPI spec
   - Endpoint: `GET /openapi.json`
   - Export to `openapi.json` file

3. Generate TypeScript SDK
   - Tool: `openapi-typescript-codegen` or `Fern API`
   - Package: `packages/sdk/`
   - Publish: `@billingos/sdk`

4. Write SDK documentation
   - `docs/sdk/typescript.md`
   - Installation guide
   - Usage examples
   - API reference

**NestJS Swagger Setup:**
```typescript
// apps/api/src/main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('BillingOS API')
    .setDescription('The BillingOS API for subscription billing and payments')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('http://localhost:3001', 'Development')
    .addServer('https://api.billingos.com', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // Save OpenAPI spec to file
  const fs = require('fs');
  fs.writeFileSync('./openapi.json', JSON.stringify(document, null, 2));

  await app.listen(3001);
}
```

**SDK Usage Example:**
```typescript
import { BillingOS } from '@billingos/sdk';

const billingos = new BillingOS({
  accessToken: process.env.BILLINGOS_ACCESS_TOKEN,
  server: 'production' // or 'sandbox'
});

// Create customer
const customer = await billingos.customers.create({
  organizationId: 'org_xxx',
  email: 'user@example.com',
  externalId: 'user_123'
});

// Track usage
await billingos.events.ingest({
  events: [{
    name: 'api_call',
    externalCustomerId: 'user_123',
    timestamp: new Date().toISOString()
  }]
});

// Check entitlements
const benefits = await billingos.benefitGrants.list({
  customerId: customer.id,
  isGranted: true
});
```

**Polar Files to Reference:**
- OpenAPI config: `/Users/ankushkumar/Code/payment/billingos/server/polar/openapi.py`
- SDK package (published): NPM `@polar-sh/sdk`

---

### Phase 7: Pricing Tables & Checkout (WEEK 7-8)

**Goal:** Embeddable pricing tables and hosted checkout

**Tasks:**
1. Create Checkout Link API
   - `POST /v1/checkout-links` - Create embeddable checkout link
   - URL format: `https://checkout.billingos.com/[org]/[link_id]`

2. Build Checkout UI (new Next.js app)
   - `apps/checkout/` - Hosted checkout page
   - Stripe Elements integration
   - Success/failure redirects
   - Custom branding (logo, colors)

3. Build Pricing Table widget
   - React component: `@billingos/pricing-table`
   - Embeddable script
   - Merchant integration: `<script src="@billingos/pricing-table"></script>`

4. Create Customer Portal
   - View subscriptions
   - Update payment method
   - View invoices
   - Cancel subscription

**Pricing Table Integration:**
```html
<!-- Merchant's website -->
<script src="https://cdn.billingos.com/pricing-table.js"></script>

<billingos-pricing-table
  organization-id="org_xxx"
  theme="dark"
></billingos-pricing-table>
```

**Polar Files to Reference:**
- Checkout widget: `/Users/ankushkumar/Code/payment/billingos/clients/packages/checkout/src/embed.ts`
- Pricing table: `/Users/ankushkumar/Code/payment/billingos/clients/apps/web/src/components/Pricing/`

---

## Quick Win: Start with Phase 1 Today

### Immediate Actions (2-3 hours):

1. **Read Polar's schema files:**
   ```bash
   cd /Users/ankushkumar/Code/payment/billingos
   cat server/polar/models/customer.py
   cat server/polar/models/product.py
   cat server/polar/models/subscription.py
   ```

2. **Create first migration:**
   ```bash
   cd /Users/ankushkumar/Code/billingos
   supabase migration new create_customers_table
   ```

3. **Write SQL migration:**
   - Copy structure from Polar's Customer model
   - Adapt to PostgreSQL syntax
   - Add indexes for performance

4. **Apply migration:**
   ```bash
   supabase db reset
   supabase gen types typescript --local > packages/shared/types/database.ts
   ```

5. **Test it works:**
   ```bash
   supabase db inspect
   ```

---

## Documentation Checklist

For each phase, create documentation:

- [ ] `docs/customers/plan.md` - Customer API plan
- [ ] `docs/customers/progress.md` - Track implementation
- [ ] `docs/customers/final.md` - Final docs with examples
- [ ] `docs/products/plan.md`
- [ ] `docs/subscriptions/plan.md`
- [ ] `docs/entitlements/plan.md`
- [ ] `docs/metering/plan.md`
- [ ] `docs/sdk/plan.md`

**Template Structure:**
```markdown
# [Feature] Implementation Plan

## Polar Reference
- File: `/Users/ankushkumar/Code/payment/billingos/...`
- Key insights: ...

## Database Schema
```sql
CREATE TABLE ...
```

## API Endpoints
- POST /v1/...
- GET /v1/...

## Implementation Steps
1. Step 1
2. Step 2

## Testing Plan
- Unit tests
- Integration tests
```

---

## Summary: Your Direction Forward

### The Big Picture:
1. **Database is source of truth** - Not Stripe
2. **SDK calls our backend** - Not Stripe directly
3. **Stripe is for payments only** - PaymentIntents, Customers, Connect accounts
4. **Follow Polar's pattern** - They've solved these problems already
5. **Document everything** - Each feature gets its own docs folder

### Start Here:
1. ✅ Read this document + `data-architecture-strategy.md`
2. ✅ Review Polar's schema files
3. ✅ Create Phase 1 database migrations
4. ✅ Create `docs/customers/plan.md`
5. ✅ Start building!

### Key Files to Reference:
- Architecture doc: `docs/architecture/data-architecture-strategy.md`
- Next steps: `docs/architecture/NEXT_STEPS.md` (this file)
- Polar models: `/Users/ankushkumar/Code/payment/billingos/server/polar/models/`
- Polar services: `/Users/ankushkumar/Code/payment/billingos/server/polar/*/service.py`

**You're ready to build! Let's make BillingOS the best billing SDK out there.** 🚀
