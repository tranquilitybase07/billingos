# BillingOS Data Architecture Strategy

**Date:** 2026-01-02
**Status:** ✅ Approved
**Key Decision:** Database as Source of Truth, NOT Stripe

---

## Executive Summary

This document defines BillingOS's core architectural strategy for data management, answering critical questions:

1. **What to store in our database vs Stripe?**
   - Store ALL business data in our database
   - Use Stripe ONLY for payment processing
   - Database is the source of truth for subscriptions, products, entitlements

2. **How does the SDK work?**
   - SDK calls BillingOS backend API (NOT Stripe directly)
   - Backend acts as middleware, communicating with Stripe when needed
   - Merchants never touch Stripe APIs directly

3. **Why this approach?**
   - Full control over billing logic
   - No vendor lock-in to Stripe
   - Faster queries (no external API calls)
   - Support features Stripe doesn't offer

---

## Research Foundation: Polar's Architecture

### Key Finding: Polar Removed Stripe IDs (December 2025)

**Migration Evidence:**
`/server/migrations/versions/2025-12-16-1127_remove_stripe_id_columns.py`

**Removed Columns:**
- `subscriptions.stripe_subscription_id` ❌
- `products.stripe_product_id` ❌
- `product_prices.stripe_price_id` ❌
- `discounts.stripe_coupon_id` ❌

**What This Means:**
Polar transitioned to a **Stripe-independent billing engine** where:
- Subscriptions are managed 100% in their database
- Stripe is used ONLY for payment processing (PaymentIntents, Charges)
- NO Stripe Subscriptions API usage
- NO syncing subscriptions to Stripe

**Only 3 Stripe IDs Remaining:**
1. `customers.stripe_customer_id` - For payment processing
2. `accounts.stripe_id` - For Connect accounts
3. `subscription.legacy_stripe_subscription_id` - For migrated subscriptions only

---

## BillingOS Data Architecture Decision

### ✅ Core Principle: Database as Single Source of Truth

**What We Store in Database:**

#### 1. Subscriptions (100% in DB)
```typescript
subscriptions {
  id: UUID
  amount: number                    // Subscription price in cents
  currency: string                  // USD, EUR, etc.
  recurring_interval: 'month' | 'year'
  recurring_interval_count: number  // 1, 3, 6, 12, etc.

  // Status & lifecycle
  status: SubscriptionStatus        // active, past_due, canceled, etc.
  current_period_start: Date
  current_period_end: Date
  trial_start?: Date
  trial_end?: Date
  cancel_at_period_end: boolean
  canceled_at?: Date

  // Relationships
  customer_id: UUID
  product_id: UUID
  payment_method_id?: UUID
  discount_id?: UUID

  // Flexibility
  metadata: JSONB                   // Custom merchant metadata
  custom_field_data: JSONB          // Dynamic custom fields

  // NO stripe_subscription_id column!
}
```

**Why No Stripe Subscription ID?**
- We manage subscription lifecycle in our code
- Stripe only processes payments when we tell it to
- Allows custom billing logic Stripe doesn't support
- No dependency on Stripe's subscription limitations

#### 2. Products (100% in DB)
```typescript
products {
  id: UUID
  name: string
  description?: string
  is_archived: boolean

  // Billing configuration
  recurring_interval: 'month' | 'year'
  recurring_interval_count: number

  // Trial configuration
  trial_duration?: number
  trial_interval?: 'day' | 'week' | 'month'

  // Tax
  is_tax_applicable: boolean
  tax_code?: string                 // Stripe tax code for invoicing

  // Relationships
  organization_id: UUID

  // Flexibility
  metadata: JSONB

  // NO stripe_product_id column!
}
```

#### 3. Product Prices (Polymorphic Pricing)
```typescript
product_prices {
  id: UUID
  product_id: UUID

  // Price type (discriminator)
  amount_type: 'fixed' | 'metered_unit' | 'seat_based' | 'custom' | 'free'
  is_archived: boolean

  // Fixed pricing fields
  price_amount?: number             // For fixed prices
  price_currency?: string

  // Metered pricing fields
  unit_amount?: Decimal             // Price per unit (12 decimals)
  cap_amount?: number               // Spending cap
  meter_id?: UUID                   // Reference to meter

  // Seat-based pricing fields
  seat_tiers?: JSONB                // Tiered pricing structure
  /* Example seat_tiers:
  {
    "tiers": [
      {"min_seats": 1, "max_seats": 5, "price_per_seat": 1000},
      {"min_seats": 6, "max_seats": 20, "price_per_seat": 900}
    ]
  }
  */

  // Custom pricing fields
  minimum_amount?: number
  maximum_amount?: number
  preset_amount?: number

  // NO stripe_price_id column!
}
```

#### 4. Customers (Minimal Stripe Reference)
```typescript
customers {
  id: UUID
  email: string
  external_id?: string              // Merchant's user ID

  organization_id: UUID

  stripe_customer_id: string        // ✅ ONLY Stripe ID we store

  metadata: JSONB

  created_at: Date
  updated_at: Date
}
```

**Why We Store `stripe_customer_id`:**
- Required to create PaymentIntents
- Required to manage payment methods
- Required for Stripe Checkout sessions
- Required for tax calculations (Stripe Tax)

#### 5. Benefit Grants (Entitlements)
```typescript
benefit_grants {
  id: UUID

  granted_at?: Date
  revoked_at?: Date

  customer_id: UUID
  member_id?: UUID                  // For team member-level grants
  benefit_id: UUID
  subscription_id?: UUID            // Which subscription granted this
  order_id?: UUID                   // Or one-time purchase

  properties: JSONB                 // Benefit-specific config
  error?: JSONB                     // Grant error details

  // Unique constraint: (subscription_id, member_id, benefit_id)
}
```

#### 6. Meters & Usage Events
```typescript
meters {
  id: UUID
  name: string
  filter: JSONB                     // Which events to count
  aggregation: 'sum' | 'count' | 'max' | 'avg'

  organization_id: UUID
  archived_at?: Date

  metadata: JSONB
}

events {
  id: UUID
  ingested_at: Date
  timestamp: Date
  name: string                      // e.g., "api.request"

  customer_id?: UUID
  external_customer_id?: string     // Before customer created
  organization_id: UUID

  metadata: JSONB                   // Event properties
}

customer_meters {
  customer_id: UUID
  meter_id: UUID
  subscription_id: UUID

  current_value: number             // Usage in current period
  last_billed_value: number         // Value at last billing
}
```

**Why Store Events in DB:**
- Fast queries for usage dashboards
- No rate limits (vs Stripe Billing Meter API)
- Custom aggregation logic
- Support complex filtering

#### 7. Webhook Events (Idempotency & Audit)
```typescript
webhook_events {
  id: UUID
  event_id: string                  // Stripe event ID (evt_xxx)
  event_type: string                // payment_intent.succeeded, etc.
  livemode: boolean

  status: 'pending' | 'processed' | 'failed'
  processed_at?: Date
  error_message?: string
  retry_count: number

  payload: JSONB                    // Full Stripe event object
  api_version?: string
  account_id?: string               // Connected account ID

  created_at: Date
  updated_at: Date
}
```

**Why Store Full Webhook Payloads:**
- Idempotency (prevent duplicate processing)
- Audit trail (compliance)
- Debugging (replay failed events)
- Historical data (Stripe only keeps 30 days)

---

### ❌ What We Do NOT Store in Database

**NO Stripe Objects We DON'T Control:**
- ❌ Stripe Subscription objects (we don't create them)
- ❌ Stripe Product objects (we don't sync to Stripe)
- ❌ Stripe Price objects (we don't sync to Stripe)
- ❌ Stripe Invoice objects (we create only for tax calculation)

**Exception for Invoices:**
We MAY create Stripe Invoices for:
- Tax calculation (Stripe Tax integration)
- Merchant preference for Stripe dashboard visibility
- Store `stripe_invoice_id` in `orders` table for reference

---

## Stripe Integration Strategy

### What We Use Stripe For

#### 1. Payment Processing
```typescript
// Create PaymentIntent when customer checks out
const paymentIntent = await stripe.paymentIntents.create({
  amount: 9900, // $99.00
  currency: 'usd',
  customer: customer.stripe_customer_id,
  metadata: {
    order_id: order.id,
    subscription_id: subscription.id
  }
});
```

#### 2. Customer Management
```typescript
// Create Stripe Customer on first checkout
const stripeCustomer = await stripe.customers.create({
  email: customer.email,
  metadata: {
    billingos_customer_id: customer.id,
    billingos_organization_id: customer.organization_id
  }
});

// Store stripe_customer_id in our DB
await db.customers.update({
  where: { id: customer.id },
  data: { stripe_customer_id: stripeCustomer.id }
});
```

#### 3. Payment Method Management
```typescript
// Create SetupIntent for payment method collection
const setupIntent = await stripe.setupIntents.create({
  customer: customer.stripe_customer_id,
  payment_method_types: ['card'],
  metadata: {
    billingos_customer_id: customer.id
  }
});
```

#### 4. Tax Calculation (Optional)
```typescript
// Create draft invoice for tax calculation
const invoice = await stripe.invoices.create({
  customer: customer.stripe_customer_id,
  auto_advance: false, // Keep as draft
  metadata: {
    billingos_order_id: order.id
  }
});

// Add line items
await stripe.invoiceItems.create({
  customer: customer.stripe_customer_id,
  invoice: invoice.id,
  amount: 9900,
  currency: 'usd',
  description: 'Professional Plan - Monthly',
  tax_code: 'txcd_10000000' // SaaS tax code
});

// Finalize to calculate tax
const finalInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
// Store finalInvoice.id in our orders table
```

#### 5. Stripe Connect Account Management
```typescript
// Already implemented in BillingOS
// apps/api/src/account/account.service.ts:64-68
const stripeAccount = await this.stripeService.createConnectAccount({
  email: createDto.email,
  country: createDto.country,
  businessType: createDto.business_type
});
```

---

### What We Do NOT Use Stripe For

#### ❌ NO Stripe Subscriptions API
```typescript
// ❌ DON'T DO THIS:
const stripeSubscription = await stripe.subscriptions.create({
  customer: customer.stripe_customer_id,
  items: [{ price: 'price_xxx' }]
});

// ✅ DO THIS INSTEAD:
const subscription = await db.subscriptions.create({
  customer_id: customer.id,
  product_id: product.id,
  amount: 9900,
  currency: 'usd',
  status: 'active',
  current_period_start: new Date(),
  current_period_end: addMonths(new Date(), 1)
});
```

**Why?**
- Stripe Subscriptions API is inflexible
- Can't support custom billing logic
- Vendor lock-in
- Limited webhook reliability
- Hard to implement dunning flows

#### ❌ NO Stripe Products/Prices Sync
```typescript
// ❌ DON'T DO THIS:
const stripeProduct = await stripe.products.create({ name: 'Pro Plan' });
const stripePrice = await stripe.prices.create({
  product: stripeProduct.id,
  unit_amount: 9900,
  currency: 'usd'
});

// ✅ DO THIS INSTEAD:
const product = await db.products.create({
  organization_id: org.id,
  name: 'Pro Plan',
  recurring_interval: 'month'
});
const price = await db.product_prices.create({
  product_id: product.id,
  amount_type: 'fixed',
  price_amount: 9900,
  price_currency: 'usd'
});
```

#### ❌ NO Stripe Billing Meter API
```typescript
// ❌ DON'T DO THIS:
await stripe.billing.meterEvents.create({
  event_name: 'api_call',
  payload: { customer_id: 'cus_xxx', value: '1' }
});

// ✅ DO THIS INSTEAD:
await db.events.create({
  name: 'api_call',
  customer_id: customer.id,
  organization_id: org.id,
  timestamp: new Date(),
  metadata: { endpoint: '/api/search', credits: 10 }
});
```

**Why?**
- Stripe Billing Meter has rate limits
- Can't query historical usage easily
- No custom aggregation logic
- Expensive at scale

---

## SDK Architecture Strategy

### Overview: Backend as Middleware

```
┌─────────────────────────────────────────────────────┐
│ Merchant Application                                │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ @billingos/sdk (TypeScript)                   │ │
│  │                                               │ │
│  │ billingos.customers.create(...)               │ │
│  │ billingos.events.ingest(...)                  │ │
│  │ billingos.subscriptions.list(...)             │ │
│  └─────────────────┬─────────────────────────────┘ │
│                    │ HTTP Requests                 │
└────────────────────┼───────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ BillingOS Backend API │
         │ (NestJS)              │
         │                       │
         │ POST /v1/customers    │
         │ POST /v1/events       │
         │ GET /v1/subscriptions │
         │                       │
         │ ┌───────────────────┐ │
         │ │ PostgreSQL DB     │ │
         │ │ (Source of Truth) │ │
         │ └───────────────────┘ │
         │                       │
         │ ┌───────────────────┐ │
         │ │ Stripe Service    │ │
         │ │ (Payments Only)   │ │
         │ └─────────┬─────────┘ │
         └───────────┼───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Stripe API            │
         │                       │
         │ - PaymentIntents      │
         │ - Customers           │
         │ - SetupIntents        │
         │ - Connect Accounts    │
         │ - Invoices (tax only) │
         └───────────────────────┘
```

### SDK Design Decisions

#### 1. SDK Calls BillingOS Backend (NOT Stripe)

**Why?**
- **Unified Authentication:** Single access token (not managing Stripe keys per merchant)
- **Abstraction:** Merchants don't need to know about Stripe
- **Business Logic:** Custom features (entitlements, meters, dunning) beyond Stripe
- **Multi-tenancy:** Each merchant isolated via organization_id
- **Rate Limiting:** We control rate limits, not Stripe
- **Caching:** We can cache responses from our DB

**Example SDK Usage:**
```typescript
import { BillingOS } from '@billingos/sdk';

const billingos = new BillingOS({
  accessToken: process.env.BILLINGOS_ACCESS_TOKEN,
  server: 'production' // or 'sandbox'
});

// Create customer (SDK → BillingOS API → our DB + Stripe Customer)
const customer = await billingos.customers.create({
  organizationId: 'org_xxx',
  email: 'user@example.com',
  externalId: 'user_123' // Merchant's user ID
});

// Track usage (SDK → BillingOS API → our DB, NO Stripe call)
await billingos.events.ingest({
  events: [{
    name: 'api_call',
    externalCustomerId: 'user_123',
    timestamp: new Date().toISOString(),
    metadata: { endpoint: '/api/search' }
  }]
});

// Check entitlements (SDK → BillingOS API → our DB, NO Stripe call)
const grants = await billingos.benefitGrants.list({
  customerId: customer.id,
  isGranted: true
});
```

#### 2. Backend Implementation Pattern

**NestJS Controller Example:**
```typescript
// apps/api/src/customer/customer.controller.ts
@Controller('v1/customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateCustomerDto
  ) {
    // 1. Validate organization access
    await this.validateOrganizationAccess(user.id, dto.organization_id);

    // 2. Create Stripe customer
    const stripeCustomer = await this.stripeService.createCustomer({
      email: dto.email,
      metadata: {
        billingos_organization_id: dto.organization_id,
        external_id: dto.external_id
      }
    });

    // 3. Create in our database
    const customer = await this.customerService.create({
      ...dto,
      stripe_customer_id: stripeCustomer.id
    });

    return customer;
  }
}
```

#### 3. Customer Session Tokens (For Client-Side)

**Pattern from Polar:**
```typescript
// Backend: Create customer session token
@Post('v1/customer-sessions')
async createSession(@Body() dto: CreateSessionDto) {
  const session = await this.customerSessionService.create({
    externalCustomerId: dto.external_customer_id,
    organizationId: dto.organization_id
  });

  return {
    token: session.token, // "billingos_cst_[hash]"
    expiresAt: session.expires_at
  };
}

// Client-side: Use session token for customer portal
const billingos = new BillingOS({
  customerSessionToken: customerSession.token // NOT organization token
});

const subscriptions = await billingos.customerPortal.subscriptions.list();
const benefits = await billingos.customerPortal.benefitGrants.list();
```

**Why Customer Sessions?**
- Secure: Time-limited tokens (24 hours)
- Scoped: Only access customer's own data
- No credential exposure: Merchants don't give customers organization tokens

---

## Webhook Handling Strategy

### Architecture: Store Full Events, Process Async

```typescript
// apps/api/src/stripe/stripe.controller.ts
@Post('webhooks')
@UseRawBody() // Required for signature verification
async handleWebhook(
  @Req() request: Request,
  @Headers('stripe-signature') signature: string
) {
  // 1. Verify webhook signature
  const event = this.stripeService.constructEvent(
    request.body,
    signature
  );

  // 2. Store full event in database (idempotency)
  const webhookEvent = await this.webhookService.storeEvent({
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    payload: event, // Full JSON
    status: 'pending'
  });

  // 3. Enqueue background job
  await this.queueService.add('stripe.webhook', {
    webhook_event_id: webhookEvent.id
  });

  // 4. Return 200 immediately
  return { received: true };
}
```

### Events We Process

**Payment Processing (Stripe → BillingOS DB):**
- `payment_intent.succeeded` → Update subscription payment status
- `payment_intent.payment_failed` → Mark subscription as past_due
- `charge.succeeded` → Record successful charge
- `charge.refunded` → Update order status
- `setup_intent.succeeded` → Save payment method

**Connect Account (Stripe → BillingOS DB):**
- `account.updated` → Sync account capabilities
- `payout.paid` → Track merchant payouts
- `payout.failed` → Alert merchant

**Events We Do NOT Process:**
- ❌ `customer.subscription.*` (we don't use Stripe Subscriptions)
- ❌ `invoice.*` (we don't create invoices except for tax)
- ❌ `price.created` (we don't sync prices to Stripe)
- ❌ `product.created` (we don't sync products to Stripe)

---

## Migration Strategy from Current Implementation

### What's Already Done ✅

1. **Stripe Connect Integration**
   - `apps/api/src/account/account.service.ts` - Account creation
   - `apps/api/src/stripe/stripe-webhook.service.ts` - Webhook handling
   - `supabase/migrations/20260102195244_create_webhook_events_table.sql` - Webhook events table

2. **Webhook Event Storage**
   - Already storing full Stripe events in `webhook_events` table
   - Idempotency check implemented
   - Status tracking (pending/processed/failed)

3. **Account Syncing**
   - Account updates synced from Stripe webhooks
   - Full account object stored in `accounts.data` JSONB

### What Needs to Change 🚧

#### 1. Create Subscription Tables
```sql
-- supabase/migrations/YYYYMMDD_create_subscription_tables.sql

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Billing
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  recurring_interval VARCHAR(20) NOT NULL, -- month, year
  recurring_interval_count INTEGER NOT NULL DEFAULT 1,

  -- Status & lifecycle
  status VARCHAR(50) NOT NULL DEFAULT 'incomplete',
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,

  -- Relationships
  customer_id UUID NOT NULL REFERENCES customers(id),
  product_id UUID NOT NULL REFERENCES products(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  discount_id UUID REFERENCES discounts(id),

  -- Flexibility
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_field_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT check_subscription_status CHECK (
    status IN ('incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')
  )
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,

  -- Billing configuration
  recurring_interval VARCHAR(20) NOT NULL, -- month, year
  recurring_interval_count INTEGER NOT NULL DEFAULT 1,

  -- Trial
  trial_duration INTEGER,
  trial_interval VARCHAR(20), -- day, week, month

  -- Tax
  is_tax_applicable BOOLEAN NOT NULL DEFAULT true,
  tax_code VARCHAR(50),

  -- Relationships
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Flexibility
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL REFERENCES products(id),

  -- Price type (discriminator)
  amount_type VARCHAR(50) NOT NULL, -- fixed, metered_unit, seat_based, custom, free
  is_archived BOOLEAN NOT NULL DEFAULT false,

  -- Fixed pricing
  price_amount INTEGER,
  price_currency VARCHAR(3),

  -- Metered pricing
  unit_amount DECIMAL(19, 12),
  cap_amount INTEGER,
  meter_id UUID REFERENCES meters(id),

  -- Seat-based pricing
  seat_tiers JSONB,

  -- Custom pricing
  minimum_amount INTEGER,
  maximum_amount INTEGER,
  preset_amount INTEGER,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT check_price_amount_type CHECK (
    amount_type IN ('fixed', 'metered_unit', 'seat_based', 'custom', 'free')
  )
);

-- More tables: benefit_grants, meters, events, customer_meters...
```

#### 2. Create Customers Table
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email VARCHAR(255) NOT NULL,
  external_id VARCHAR(255), -- Merchant's user ID

  organization_id UUID NOT NULL REFERENCES organizations(id),

  stripe_customer_id VARCHAR(255) NOT NULL, -- ✅ ONLY Stripe ID

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(organization_id, external_id),
  UNIQUE(stripe_customer_id)
);
```

#### 3. Remove Any Stripe Subscription References
- Ensure NO `stripe_subscription_id` columns exist
- Ensure NO `stripe_product_id` columns exist
- Ensure NO `stripe_price_id` columns exist

#### 4. Implement Subscription Billing Service
```typescript
// apps/api/src/subscription/subscription.service.ts
@Injectable()
export class SubscriptionService {
  async createFromCheckout(
    checkout: Checkout,
    paymentMethod: PaymentMethod
  ): Promise<Subscription> {
    // Calculate billing dates
    const currentPeriodStart = new Date();
    const currentPeriodEnd = this.calculatePeriodEnd(
      currentPeriodStart,
      checkout.product.recurring_interval,
      checkout.product.recurring_interval_count
    );

    // Create subscription in OUR database (NO Stripe API call)
    const subscription = await this.db.subscriptions.create({
      customer_id: checkout.customer_id,
      product_id: checkout.product_id,
      payment_method_id: paymentMethod.id,
      amount: checkout.amount,
      currency: checkout.currency,
      status: 'active',
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      recurring_interval: checkout.product.recurring_interval,
      recurring_interval_count: checkout.product.recurring_interval_count
    });

    // Enqueue benefit grants
    await this.benefitGrantService.grantForSubscription(subscription.id);

    // Schedule next billing cycle
    await this.billingScheduler.scheduleNextCharge(subscription.id);

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
        billing_period_start: subscription.current_period_start.toISOString(),
        billing_period_end: subscription.current_period_end.toISOString()
      }
    });

    // Create order record
    await this.orderService.create({
      subscription_id: subscription.id,
      amount: subscription.amount,
      stripe_payment_intent_id: paymentIntent.id,
      status: 'processing'
    });

    // Webhook will update order status when payment succeeds/fails
  }
}
```

---

## Implementation Roadmap

### Phase 1: Database Schema (Week 1)
1. Create `customers` table
2. Create `products` table
3. Create `product_prices` table
4. Create `subscriptions` table
5. Create `orders` table
6. Create `payment_methods` table
7. Update `packages/shared/types/database.ts`

**Files to Create:**
- `supabase/migrations/YYYYMMDD_create_customers_table.sql`
- `supabase/migrations/YYYYMMDD_create_products_and_prices_tables.sql`
- `supabase/migrations/YYYYMMDD_create_subscriptions_table.sql`
- `supabase/migrations/YYYYMMDD_create_orders_table.sql`

### Phase 2: Backend API - Customers & Products (Week 2)
1. Create Customer module
   - `POST /v1/customers`
   - `GET /v1/customers/:id`
   - `GET /v1/customers?organization_id=xxx`
2. Create Product module
   - `POST /v1/products`
   - `GET /v1/products/:id`
   - `PATCH /v1/products/:id`
3. Create Price module (nested under products)
   - `POST /v1/products/:id/prices`
   - `GET /v1/products/:id/prices`

**Files to Create:**
- `apps/api/src/customer/customer.module.ts`
- `apps/api/src/customer/customer.service.ts`
- `apps/api/src/customer/customer.controller.ts`
- `apps/api/src/product/product.module.ts`
- `apps/api/src/product/product.service.ts`
- `apps/api/src/product/product.controller.ts`

### Phase 3: Backend API - Subscriptions (Week 3)
1. Create Subscription module
   - `POST /v1/subscriptions` (create from checkout)
   - `GET /v1/subscriptions/:id`
   - `GET /v1/subscriptions?customer_id=xxx`
   - `POST /v1/subscriptions/:id/cancel`
2. Implement billing scheduler (BullMQ)
   - Job: `billing.charge-subscription`
   - Cron: Run daily to check subscriptions due for renewal
3. Implement payment failure handling
   - Retry logic (3 attempts over 10 days)
   - Update subscription status to `past_due`

**Files to Create:**
- `apps/api/src/subscription/subscription.module.ts`
- `apps/api/src/subscription/subscription.service.ts`
- `apps/api/src/subscription/subscription.controller.ts`
- `apps/api/src/subscription/billing-scheduler.service.ts`

### Phase 4: Entitlements & Benefits (Week 4)
1. Create database tables:
   - `benefits` - Feature definitions
   - `product_benefits` - Products linked to benefits
   - `benefit_grants` - Customer entitlements
2. Create Benefit module
   - `POST /v1/benefits`
   - `GET /v1/benefits/:id`
3. Create BenefitGrant service
   - Auto-grant benefits when subscription created
   - Auto-revoke benefits when subscription canceled
4. Create Customer Portal endpoint
   - `GET /v1/customer-portal/benefit-grants`

**Files to Create:**
- `supabase/migrations/YYYYMMDD_create_benefits_tables.sql`
- `apps/api/src/benefit/benefit.module.ts`
- `apps/api/src/benefit/benefit-grant.service.ts`

### Phase 5: Usage Metering (Week 5)
1. Create database tables:
   - `meters` - Meter definitions
   - `events` - Usage events
   - `customer_meters` - Per-customer usage tracking
2. Create Event Ingestion API
   - `POST /v1/events/ingest`
   - Bulk insert support (up to 100 events)
3. Create Meter module
   - `POST /v1/meters`
   - `GET /v1/meters/:id/quantities` (usage query)
4. Implement meter aggregation service
   - Background job to aggregate events into `customer_meters`

**Files to Create:**
- `supabase/migrations/YYYYMMDD_create_meters_tables.sql`
- `apps/api/src/event/event.module.ts`
- `apps/api/src/event/event.controller.ts`
- `apps/api/src/meter/meter.module.ts`
- `apps/api/src/meter/meter.service.ts`

### Phase 6: SDK Development (Week 6)
1. Generate OpenAPI spec from NestJS
   - Install `@nestjs/swagger`
   - Decorate all endpoints with `@ApiOperation`, `@ApiResponse`
   - Export to `/openapi.json`
2. Generate TypeScript SDK
   - Use `openapi-typescript-codegen` or `Fern API`
   - Publish as `@billingos/sdk` on NPM
3. Create example integration
   - Next.js demo app showing SDK usage
   - Documentation in `docs/sdk/typescript.md`

**Files to Create:**
- `packages/sdk/` - SDK package
- `apps/api/src/openapi.config.ts` - OpenAPI configuration
- `examples/nextjs-integration/` - Example app

### Phase 7: Pricing Tables & Checkout Widget (Week 7-8)
1. Create Checkout Link API
   - `POST /v1/checkout-links`
   - Embeddable URLs: `https://checkout.billingos.com/[org]/[link_id]`
2. Build Checkout UI (Next.js app)
   - Hosted checkout page
   - Stripe Elements integration
   - Success/failure redirects
3. Build Pricing Table component
   - React component: `@billingos/pricing-table`
   - Embeddable script: `<script src="@billingos/pricing-table"></script>`
4. Create Customer Portal
   - Subscription management
   - Invoice history
   - Payment method updates

**Files to Create:**
- `apps/checkout/` - New Next.js app for checkout UI
- `packages/pricing-table/` - Pricing table widget
- `apps/api/src/checkout/checkout.module.ts`

---

## Documentation Requirements

### For Each Feature, Create:

1. **`docs/[feature]/plan.md`**
   - Reference Polar's implementation
   - Database schema changes
   - API endpoints needed
   - SDK methods to expose

2. **`docs/[feature]/progress.md`**
   - Implementation checklist
   - Blockers encountered
   - Decisions made

3. **`docs/[feature]/final.md`**
   - Usage examples
   - API documentation
   - SDK code examples
   - Gotchas and lessons learned

### Example Structure:
```
docs/
├── architecture/
│   └── data-architecture-strategy.md (this file)
├── subscriptions/
│   ├── plan.md
│   ├── progress.md
│   └── final.md
├── entitlements/
│   ├── plan.md
│   ├── progress.md
│   └── final.md
├── metering/
│   ├── plan.md
│   ├── progress.md
│   └── final.md
└── sdk/
    ├── plan.md
    ├── progress.md
    └── final.md
```

---

## Key Takeaways

### ✅ DO This:
1. Store ALL business data in PostgreSQL database
2. Use Stripe ONLY for payment processing (PaymentIntents, Charges, Customers)
3. Build SDK that calls BillingOS backend (not Stripe directly)
4. Store full webhook events in JSONB for idempotency
5. Process webhooks asynchronously via BullMQ
6. Snapshot transaction data (amounts, prices) at time of creation
7. Use customer session tokens for client-side operations

### ❌ DON'T Do This:
1. Don't use Stripe Subscriptions API
2. Don't sync products/prices to Stripe
3. Don't store stripe_subscription_id, stripe_product_id, stripe_price_id
4. Don't use Stripe Billing Meter API
5. Don't let merchants call Stripe APIs directly
6. Don't rely on Stripe as source of truth for subscriptions

### Why This Approach Wins:
- **Full Control:** You own the billing logic, not Stripe
- **Flexibility:** Support features Stripe doesn't offer
- **Performance:** Fast queries from your database, no external API calls
- **Vendor Independence:** Can swap Stripe for another processor
- **Cost Efficiency:** No Stripe subscription fees on top of payment processing
- **Custom Features:** Dunning, retention, entitlements, metering all in-house

---

## Next Steps

1. ✅ Review this architecture document with team
2. Create Phase 1 database migrations
3. Start with customers and products API
4. Reference Polar's code for each feature
5. Document everything as you build
6. Test with real Stripe Connect accounts

**Ready to build the future of billing!** 🚀
