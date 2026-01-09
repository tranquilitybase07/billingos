# Subscription Management API - Implementation Plan

**Date:** January 5, 2026
**Status:** Approved - Ready for Implementation
**Reference:** Polar.sh architecture patterns

---

## Executive Summary

Building a subscription management system where merchants can:
1. Create products with multiple pricing options
2. Attach features (entitlements) with usage limits
3. Track customer subscriptions
4. Monitor feature usage and enforce quotas

**Key Insight:** Everything happens on a single page in the UI, so APIs must support atomic operations.

**Terminology Decision:** We use "Features" instead of "Entitlements" or "Benefits" for clarity.

---

## Phase 1 Scope

### What We're Building NOW

✅ **Products**
- Create products with name, description, billing interval
- Support multiple prices per product (monthly/annual options)
- Link to features
- Stripe integration (dual-write pattern)

✅ **Features (with Usage Limits)**
- Reusable feature library (merchants define once, use in multiple products)
- Two types: Boolean flags (`has_premium_support`) and Usage quotas (`api_calls_limit: 1000/month`)
- Each feature has:
  - **name** (technical key: `api_calls_limit`)
  - **title** (display name: "1,000 API Calls per Month")
  - **type** (enum: `boolean_flag`, `usage_quota`)
  - **properties** (JSONB: configuration like limits, periods)

✅ **Subscriptions**
- Create subscriptions for customers
- Automatically grant all product features
- Initialize usage tracking for quota features
- Sync with Stripe (hybrid architecture)

✅ **Usage Tracking**
- Track consumption against quotas
- Enforce limits
- Reset at billing period boundaries
- Fast checks (Redis-cached)

### What's Phase 2

❌ **Usage-Based Billing** (pay-per-use metering)
❌ **Seat-Based Pricing** (per-user with volume tiers)
❌ **Custom Pricing** (pay-what-you-want)
❌ **Advanced credit systems**

---

## Architecture Overview

### Module Structure

```
apps/api/src/
├── products/
│   ├── products.module.ts
│   ├── products.service.ts
│   ├── products.controller.ts
│   └── dto/
│       ├── create-product.dto.ts
│       ├── update-product.dto.ts
│       └── create-price.dto.ts
├── features/
│   ├── features.module.ts
│   ├── features.service.ts
│   ├── features.controller.ts
│   └── dto/
│       ├── create-feature.dto.ts
│       ├── check-feature.dto.ts
│       └── track-usage.dto.ts
└── subscriptions/
    ├── subscriptions.module.ts (enhance existing)
    ├── subscriptions.service.ts
    ├── subscriptions.controller.ts
    └── dto/
        └── create-subscription.dto.ts
```

---

## Database Schema

### 1. Products Table

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Product details
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Billing configuration
  recurring_interval VARCHAR(20) NOT NULL, -- 'month', 'year', 'week', 'day'
  recurring_interval_count INTEGER DEFAULT 1, -- e.g., 2 = every 2 months

  -- Stripe integration
  stripe_product_id VARCHAR(255),

  -- Trial configuration
  trial_days INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  is_archived BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_id, stripe_product_id)
);

CREATE INDEX idx_products_organization ON products(organization_id);
CREATE INDEX idx_products_archived ON products(is_archived);
```

### 2. Product_Prices Table

```sql
CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Price type
  amount_type VARCHAR(20) NOT NULL, -- 'fixed', 'free'

  -- Fixed price details
  price_amount INTEGER, -- cents (NULL for free)
  price_currency VARCHAR(3) DEFAULT 'usd', -- ISO currency code

  -- Stripe integration
  stripe_price_id VARCHAR(255),

  -- Status
  is_archived BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (
    (amount_type = 'free' AND price_amount IS NULL) OR
    (amount_type = 'fixed' AND price_amount IS NOT NULL)
  )
);

CREATE INDEX idx_product_prices_product ON product_prices(product_id);
CREATE INDEX idx_product_prices_archived ON product_prices(is_archived);
```

### 3. Features Table

```sql
CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Feature identification
  name VARCHAR(100) NOT NULL, -- Technical key: 'api_calls_limit'
  title VARCHAR(255) NOT NULL, -- Display name: '1,000 API Calls per Month'
  description TEXT,

  -- Feature type
  type VARCHAR(50) NOT NULL, -- 'boolean_flag', 'usage_quota', 'numeric_limit'

  -- Configuration (JSONB)
  -- For boolean_flag: {}
  -- For usage_quota: {limit: 1000, period: 'month', unit: 'calls'}
  -- For numeric_limit: {limit: 100, unit: 'projects'}
  properties JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_features_organization ON features(organization_id);
CREATE INDEX idx_features_name ON features(organization_id, name);
```

### 4. Product_Features Junction Table

```sql
CREATE TABLE product_features (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,

  -- Display configuration
  display_order INTEGER NOT NULL,

  -- Per-product feature configuration override (JSONB)
  -- Allows different limits per product:
  -- Starter: {limit: 1000}, Pro: {limit: 5000}, Enterprise: {limit: 50000}
  config JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  PRIMARY KEY (product_id, feature_id),
  UNIQUE (product_id, display_order)
);

CREATE INDEX idx_product_features_product ON product_features(product_id);
CREATE INDEX idx_product_features_feature ON product_features(feature_id);
```

### 5. Subscriptions Table (Enhance Existing)

**Check if subscriptions table exists from previous work. If not, create:**

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),

  -- Subscription details
  status VARCHAR(50) NOT NULL, -- 'active', 'canceled', 'past_due', 'trialing', 'incomplete'
  amount INTEGER NOT NULL, -- Total amount in cents
  currency VARCHAR(3) NOT NULL,

  -- Billing period
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,

  -- Trial
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  -- Cancellation
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,

  -- Stripe integration
  stripe_subscription_id VARCHAR(255),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_id, stripe_subscription_id)
);

CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_product ON subscriptions(product_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_organization ON subscriptions(organization_id);
```

### 6. Feature_Grants Table

```sql
CREATE TABLE feature_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,

  -- Grant lifecycle
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- Resolved feature configuration (snapshot at grant time)
  -- Prevents changes to feature affecting active grants
  properties JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(subscription_id, feature_id)
);

CREATE INDEX idx_feature_grants_customer ON feature_grants(customer_id);
CREATE INDEX idx_feature_grants_subscription ON feature_grants(subscription_id);
CREATE INDEX idx_feature_grants_feature ON feature_grants(feature_id);
CREATE INDEX idx_feature_grants_active ON feature_grants(customer_id, revoked_at) WHERE revoked_at IS NULL;
```

### 7. Usage_Records Table

```sql
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  -- Billing period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Usage tracking
  consumed_units DECIMAL(20, 6) DEFAULT 0, -- Allow fractional units
  limit_units DECIMAL(20, 6), -- NULL = unlimited

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(customer_id, feature_id, period_start)
);

CREATE INDEX idx_usage_records_customer ON usage_records(customer_id);
CREATE INDEX idx_usage_records_feature ON usage_records(feature_id);
CREATE INDEX idx_usage_records_period ON usage_records(customer_id, feature_id, period_start, period_end);
```

---

## API Endpoints

### Products Module

#### 1. Create Product (Atomic Operation)

```
POST /api/products
Authorization: Bearer <jwt_token>

Request Body:
{
  "name": "Pro Plan",
  "description": "Professional features for growing teams",
  "recurring_interval": "month",
  "recurring_interval_count": 1,
  "trial_days": 14,
  "prices": [
    {
      "amount_type": "fixed",
      "price_amount": 2900,
      "price_currency": "usd"
    },
    {
      "amount_type": "fixed",
      "price_amount": 29000,
      "price_currency": "usd",
      "recurring_interval": "year"
    }
  ],
  "features": [
    {
      "feature_id": "uuid-of-existing-feature",
      "display_order": 1
    },
    {
      "feature_id": "uuid-of-another-feature",
      "display_order": 2,
      "config": {"limit": 5000}
    }
  ]
}

Response: 201 Created
{
  "id": "uuid",
  "name": "Pro Plan",
  "description": "Professional features for growing teams",
  "recurring_interval": "month",
  "recurring_interval_count": 1,
  "trial_days": 14,
  "stripe_product_id": "prod_xxx",
  "prices": [
    {
      "id": "uuid",
      "amount_type": "fixed",
      "price_amount": 2900,
      "price_currency": "usd",
      "stripe_price_id": "price_xxx"
    }
  ],
  "features": [
    {
      "id": "uuid",
      "name": "api_calls_limit",
      "title": "5,000 API Calls per Month",
      "type": "usage_quota",
      "display_order": 1,
      "properties": {"limit": 5000, "period": "month"}
    }
  ],
  "created_at": "2026-01-05T10:00:00Z"
}
```

**Backend Process:**
1. Validate organization ownership
2. Create product in Stripe
3. Create prices in Stripe
4. Save product to PostgreSQL
5. Save prices to PostgreSQL
6. Link features via product_features junction
7. Return complete product object (includes features)

#### 2. List Products (for Pricing Table)

```
GET /api/products?organization_id=uuid
Authorization: Bearer <jwt_token>

Query Params:
- include_archived: boolean (default: false)
- include_features: boolean (default: true)
- include_prices: boolean (default: true)

Response: 200 OK
{
  "products": [
    {
      "id": "uuid",
      "name": "Starter Plan",
      "description": "...",
      "recurring_interval": "month",
      "prices": [...],
      "features": [
        {
          "title": "1,000 API Calls per Month",
          "type": "usage_quota",
          "display_order": 1
        }
      ]
    }
  ]
}
```

#### 3. Get Product

```
GET /api/products/:id
Authorization: Bearer <jwt_token>

Response: 200 OK
{...product details with prices and features...}
```

#### 4. Update Product

```
PATCH /api/products/:id
Authorization: Bearer <jwt_token>

Request Body:
{
  "name": "Pro Plan - Updated",
  "description": "New description"
}

Response: 200 OK
{...updated product...}
```

#### 5. Archive Product

```
DELETE /api/products/:id
Authorization: Bearer <jwt_token>

Response: 204 No Content
```

---

### Features Module

#### 1. Create Feature

```
POST /api/features
Authorization: Bearer <jwt_token>

Request Body:
{
  "name": "api_calls_limit",
  "title": "API Calls per Month",
  "description": "Track and limit API usage",
  "type": "usage_quota",
  "properties": {
    "limit": 1000,
    "period": "month",
    "unit": "calls"
  }
}

Response: 201 Created
{
  "id": "uuid",
  "name": "api_calls_limit",
  "title": "API Calls per Month",
  "type": "usage_quota",
  "properties": {...},
  "created_at": "2026-01-05T10:00:00Z"
}
```

#### 2. List Features

```
GET /api/features?organization_id=uuid
Authorization: Bearer <jwt_token>

Response: 200 OK
{
  "features": [
    {
      "id": "uuid",
      "name": "api_calls_limit",
      "title": "API Calls per Month",
      "type": "usage_quota",
      "properties": {...}
    }
  ]
}
```

#### 3. Check Feature Access (SDK Endpoint)

```
GET /api/features/check
Authorization: Bearer <sdk_access_token>

Query Params:
- customer_id: uuid (required)
- feature_name: string (required)

Response: 200 OK
{
  "has_access": true,
  "feature": {
    "name": "api_calls_limit",
    "type": "usage_quota",
    "properties": {
      "limit": 1000,
      "consumed": 234,
      "remaining": 766,
      "period": "month",
      "resets_at": "2026-02-01T00:00:00Z"
    }
  }
}

Response (No Access): 200 OK
{
  "has_access": false,
  "reason": "no_active_subscription"
}

Response (Limit Exceeded): 200 OK
{
  "has_access": false,
  "reason": "quota_exceeded",
  "feature": {
    "name": "api_calls_limit",
    "type": "usage_quota",
    "properties": {
      "limit": 1000,
      "consumed": 1000,
      "remaining": 0,
      "resets_at": "2026-02-01T00:00:00Z"
    }
  }
}
```

**Caching Strategy:**
- Cache in Redis: `feature:check:{customer_id}:{feature_name}` with 5-minute TTL
- On cache miss: Query PostgreSQL
- Invalidate on: subscription changes, usage updates

#### 4. Track Usage

```
POST /api/features/track-usage
Authorization: Bearer <sdk_access_token>

Request Body:
{
  "customer_id": "uuid",
  "feature_name": "api_calls_limit",
  "units": 1,
  "idempotency_key": "optional-unique-key"
}

Response: 200 OK
{
  "success": true,
  "consumed_units": 235,
  "limit_units": 1000,
  "remaining_units": 765
}

Response (Limit Exceeded): 400 Bad Request
{
  "error": "quota_exceeded",
  "message": "Usage limit reached for api_calls_limit",
  "consumed_units": 1000,
  "limit_units": 1000
}
```

**Implementation:**
- Atomic increment in PostgreSQL
- Check limit before incrementing
- Invalidate Redis cache on update
- Support idempotency for duplicate requests

---

### Subscriptions Module

#### 1. Create Subscription

```
POST /api/subscriptions
Authorization: Bearer <jwt_token>

Request Body:
{
  "customer_id": "uuid",
  "product_id": "uuid",
  "price_id": "uuid",
  "payment_method_id": "pm_xxx" // Stripe payment method
}

Response: 201 Created
{
  "id": "uuid",
  "customer_id": "uuid",
  "product_id": "uuid",
  "status": "active",
  "amount": 2900,
  "currency": "usd",
  "current_period_start": "2026-01-05T10:00:00Z",
  "current_period_end": "2026-02-05T10:00:00Z",
  "stripe_subscription_id": "sub_xxx",
  "granted_features": [
    {
      "feature_id": "uuid",
      "name": "api_calls_limit",
      "title": "5,000 API Calls per Month",
      "granted_at": "2026-01-05T10:00:00Z"
    }
  ]
}
```

**Backend Process:**
1. Validate customer exists
2. Validate product exists
3. Create subscription in Stripe
4. Save subscription to PostgreSQL
5. **Grant all product features:**
   - Create feature_grant records
   - Initialize usage_records for quota features
6. Invalidate customer feature cache (Redis)
7. Return subscription with granted features

#### 2. Get Subscription

```
GET /api/subscriptions/:id
Authorization: Bearer <jwt_token>

Response: 200 OK
{...subscription details with granted features...}
```

#### 3. Cancel Subscription

```
POST /api/subscriptions/:id/cancel
Authorization: Bearer <jwt_token>

Request Body:
{
  "cancel_at_period_end": true
}

Response: 200 OK
{
  "id": "uuid",
  "status": "active",
  "cancel_at_period_end": true,
  "canceled_at": "2026-01-05T10:00:00Z"
}
```

**Backend Process:**
1. Cancel subscription in Stripe
2. Update subscription in PostgreSQL
3. If immediate cancellation:
   - Set status = 'canceled'
   - Revoke all feature grants (set revoked_at)
   - Invalidate Redis cache
4. If cancel_at_period_end:
   - Set flag, but keep features active until period ends

---

## Data Flow Patterns

### Pattern 1: Product Creation (Atomic)

```
User submits form → POST /api/products
    ↓
1. Validate data (DTOs)
    ↓
2. Start DB transaction
    ↓
3. Create product in Stripe → get stripe_product_id
    ↓
4. Create prices in Stripe → get stripe_price_ids
    ↓
5. Insert product row (with stripe_product_id)
    ↓
6. Insert product_prices rows (with stripe_price_ids)
    ↓
7. Insert product_features rows (junction)
    ↓
8. Commit transaction
    ↓
9. Return complete product object
```

**Rollback Strategy:**
- If Stripe fails: Return error, no DB writes
- If DB fails: Delete Stripe product/prices (cleanup)
- Use transactions for DB operations

### Pattern 2: Feature Access Check (Fast)

```
SDK calls GET /api/features/check?customer_id=X&feature_name=Y
    ↓
1. Check Redis cache: feature:check:{customer_id}:{feature_name}
    ↓
2. Cache hit? → Return cached result (2-5ms)
    ↓
3. Cache miss? → Query PostgreSQL:
    SELECT fg.*, ur.consumed_units, ur.limit_units
    FROM feature_grants fg
    JOIN features f ON f.id = fg.feature_id
    LEFT JOIN usage_records ur ON ur.customer_id = fg.customer_id AND ur.feature_id = fg.feature_id
    WHERE fg.customer_id = X
      AND f.name = Y
      AND fg.revoked_at IS NULL
    ↓
4. Store in Redis with 5-minute TTL
    ↓
5. Return result (5-15ms on cache miss)
```

### Pattern 3: Usage Tracking (Atomic)

```
SDK calls POST /api/features/track-usage
    ↓
1. Start DB transaction
    ↓
2. Get current usage_record for (customer, feature, current_period)
    ↓
3. Check: consumed_units + new_units <= limit_units?
    ↓
4. If over limit: Rollback, return 400 error
    ↓
5. If within limit:
    UPDATE usage_records
    SET consumed_units = consumed_units + new_units
    WHERE id = X
    ↓
6. Commit transaction
    ↓
7. Invalidate Redis cache: DEL feature:check:{customer_id}:{feature_name}
    ↓
8. Return updated usage
```

### Pattern 4: Subscription Creation (Complex)

```
POST /api/subscriptions
    ↓
1. Validate customer, product, price
    ↓
2. Create subscription in Stripe → get stripe_subscription_id
    ↓
3. Start DB transaction
    ↓
4. Insert subscription row
    ↓
5. Query product features:
    SELECT pf.feature_id, pf.config, f.*
    FROM product_features pf
    JOIN features f ON f.id = pf.feature_id
    WHERE pf.product_id = X
    ↓
6. For each feature:
    a. Insert feature_grant row
    b. If feature.type = 'usage_quota':
        - Merge feature.properties with pf.config
        - Insert usage_record with limit from merged config
    ↓
7. Commit transaction
    ↓
8. Invalidate Redis caches for customer
    ↓
9. Return subscription with granted_features
```

---

## Key Implementation Details

### 1. Hybrid Architecture (Stripe + DB)

**Write Path:**
1. Write to Stripe first (source of truth)
2. Immediately cache in PostgreSQL
3. Webhooks confirm/update later

**Read Path:**
1. Read from PostgreSQL (fast)
2. Fallback to Stripe if not cached
3. Redis cache for frequently accessed data

### 2. Feature Configuration Inheritance

**Priority (highest to lowest):**
1. Product-specific override (`product_features.config`)
2. Base feature configuration (`features.properties`)

**Example:**
```
Feature: api_calls_limit
  properties: {limit: 1000, period: 'month'}

Product: Starter Plan
  product_features.config: {} (uses base: 1000)

Product: Pro Plan
  product_features.config: {limit: 5000} (overrides: 5000)
```

### 3. Usage Period Boundaries

**Billing Period Alignment:**
- Usage records align with subscription billing periods
- On subscription renewal: Create new usage_record for new period
- Old usage_record stays for historical tracking

**Webhook Handler:**
```typescript
// On Stripe webhook: customer.subscription.updated
if (event.type === 'customer.subscription.updated') {
  const sub = event.data.object;

  // Check if new billing period started
  if (sub.current_period_start changed) {
    // Create new usage records for all quota features
    await createNewUsageRecordsForPeriod(sub);
  }
}
```

### 4. Redis Caching Strategy

**Cache Keys:**
```
feature:check:{customer_id}:{feature_name} → {has_access, properties}
customer:features:{customer_id} → [list of granted feature IDs]
product:features:{product_id} → [list of feature objects]
```

**Cache TTLs:**
- Feature checks: 5 minutes
- Product features: 60 minutes
- Customer feature list: 10 minutes

**Invalidation Triggers:**
- Subscription created/canceled → Invalidate customer:features:*
- Usage tracked → Invalidate feature:check:*
- Product features updated → Invalidate product:features:*

### 5. Atomic Operations & Transactions

**Use DB Transactions For:**
- Product creation (product + prices + features)
- Subscription creation (subscription + grants + usage_records)
- Usage tracking (check limit + increment)

**Pattern:**
```typescript
await this.db.transaction(async (tx) => {
  const product = await tx.products.create({...});
  await tx.product_prices.createMany({...});
  await tx.product_features.createMany({...});
  return product;
});
```

---

## Testing Strategy

### Unit Tests

**Products Service:**
- [ ] Create product with fixed prices
- [ ] Create product with free price
- [ ] Create product with multiple prices
- [ ] Link features to product
- [ ] Validate organization ownership
- [ ] Handle Stripe API failures

**Features Service:**
- [ ] Check feature access (has access)
- [ ] Check feature access (no subscription)
- [ ] Check feature access (quota exceeded)
- [ ] Track usage within limit
- [ ] Track usage exceeding limit
- [ ] Idempotency on duplicate tracking

**Subscriptions Service:**
- [ ] Create subscription with feature grants
- [ ] Initialize usage records for quota features
- [ ] Cancel subscription (revoke grants)
- [ ] Handle webhook updates

### Integration Tests

- [ ] End-to-end: Create product → Create subscription → Check feature → Track usage
- [ ] Stripe webhook flow: subscription.created → grant features
- [ ] Stripe webhook flow: subscription.canceled → revoke features
- [ ] Redis caching: Check cache hits/misses
- [ ] Concurrent usage tracking: Ensure atomicity

### Test Data (see test-data.md)

---

## Stripe Integration Details

### Product Creation

```typescript
// Create product in Stripe
const stripeProduct = await stripe.products.create({
  name: dto.name,
  description: dto.description,
  metadata: {
    organization_id: user.organization_id
  }
}, {
  stripeAccount: organization.stripe_account_id // Connect!
});

// Create prices in Stripe
for (const priceDto of dto.prices) {
  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    currency: priceDto.price_currency,
    unit_amount: priceDto.price_amount,
    recurring: {
      interval: dto.recurring_interval
    }
  }, {
    stripeAccount: organization.stripe_account_id
  });
}
```

### Subscription Creation

```typescript
// Create subscription in Stripe
const stripeSubscription = await stripe.subscriptions.create({
  customer: customer.stripe_customer_id,
  items: [{ price: stripe_price_id }],
  trial_period_days: product.trial_days,
  metadata: {
    customer_id: customer.id,
    product_id: product.id
  }
}, {
  stripeAccount: organization.stripe_account_id
});
```

### Webhooks to Handle

- `customer.subscription.created` → Cache subscription, grant features
- `customer.subscription.updated` → Update cache, check period changes
- `customer.subscription.deleted` → Mark canceled, revoke features
- `invoice.payment_succeeded` → Mark subscription active
- `invoice.payment_failed` → Mark subscription past_due

---

## Performance Targets

| Operation | Target Latency | Strategy |
|-----------|----------------|----------|
| Check feature access | <10ms | Redis cache (5-minute TTL) |
| Track usage | <50ms | Atomic PostgreSQL update |
| Create product | <1s | Stripe API + DB transaction |
| Create subscription | <1s | Stripe API + DB + grant features |
| List products | <100ms | PostgreSQL with eager loading |

---

## Security Considerations

### Authorization

**Organization-scoped:**
- All product APIs require organization_id in JWT
- RLS policies ensure data isolation

**Customer-scoped:**
- Feature check/track APIs use SDK access token
- Validate customer belongs to organization

### Input Validation

- DTOs with class-validator decorators
- Validate feature names (alphanumeric + underscore only)
- Validate usage units (positive numbers only)
- Validate price amounts (non-negative)

### Rate Limiting

- Feature check: 1000 req/min per customer
- Track usage: 100 req/min per customer
- Product CRUD: 100 req/min per organization

---

## Migration from Phase 1 → Phase 2

**When adding usage-based billing:**

1. Add new `amount_type` values: `'metered_unit'`, `'seat_based'`
2. Add `product_prices` columns: `unit_amount`, `meter_id`, `cap_amount`
3. Create `meters` table
4. Migrate usage_records to event-based system
5. Update subscription creation to handle metered prices

**Schema is designed to be extensible!**

---

## Next Steps

1. **Create database migrations** (Day 1)
2. **Build Products module** (Days 2-3)
3. **Build Features module** (Day 4)
4. **Enhance Subscriptions module** (Day 5)
5. **Write integration tests** (End of Week 1)
6. **Create test data file** (End of Week 1)

---

## Questions & Decisions Log

**Q: What's the difference between metering and usage limits?**
**A:** Usage limits = "You get 1000 API calls" (Phase 1). Metering = "You pay per API call" (Phase 2).

**Q: Can features be reused across products?**
**A:** Yes! Features are organization-level. Create once, attach to multiple products with different configs.

**Q: How do we handle feature configuration overrides?**
**A:** Base config in `features.properties`, override in `product_features.config`, merge at runtime.

**Q: What happens when a subscription ends?**
**A:** Webhook triggers revocation: Set `feature_grants.revoked_at`, clear Redis cache.

**Q: How do we support both monthly and annual pricing?**
**A:** Multiple prices per product. Annual price can have different `recurring_interval_count`.

---

## References

- Polar architecture: `/Users/ankushkumar/Code/payment/billingos`
- Hybrid architecture doc: `docs/plan/01-hybrid-architecture.md`
- Stripe Connect docs: https://docs.stripe.com/connect
- Stripe Subscriptions API: https://docs.stripe.com/api/subscriptions

---

**Status:** Plan approved, ready for implementation ✅
**Next:** Create database migrations
