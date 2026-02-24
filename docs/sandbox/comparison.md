# Sandbox Implementation Comparison: Autumn vs Flowglad

## Overview

This document compares the sandbox implementation approaches of Autumn and Flowglad, analyzing their strengths and weaknesses to inform BillingOS's implementation strategy.

## Autumn's Implementation

### Architecture Overview

Autumn uses a **single database with environment separation** through configuration flags and separate API keys.

```
┌─────────────────────┐
│   Single Database   │
├─────────────────────┤
│ Organizations Table │
│ - test_stripe_keys  │
│ - live_stripe_keys  │
│ - test_pkey        │
│ - live_pkey        │
└─────────────────────┘
         ↓
    Environment
    Detection
    (API Key Prefix)
         ↓
    Route to Test
    or Live Logic
```

### Key Components

#### 1. Database Schema
```sql
-- Organizations table stores both test and live configurations
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT,
  -- Separate Stripe configurations
  test_stripe_connect JSONB,      -- Test Stripe account details
  live_stripe_connect JSONB,      -- Live Stripe account details
  test_stripe_webhook_secret TEXT,
  live_stripe_webhook_secret TEXT,
  -- Separate API keys
  test_pkey TEXT,                 -- am_pk_test_*
  live_pkey TEXT,                 -- am_pk_live_*
  test_skey TEXT,                 -- am_sk_test_*
  live_skey TEXT                  -- am_sk_live_*
);
```

#### 2. Environment Detection
```typescript
// Autumn determines environment from API key prefix
export function getEnvironmentFromKey(apiKey: string): AppEnv {
  if (apiKey.startsWith('am_pk_test_') || apiKey.startsWith('am_sk_test_')) {
    return AppEnv.Sandbox;
  }
  return AppEnv.Live;
}
```

#### 3. UI Implementation
```typescript
// Environment dropdown in sidebar
<Select value={environment} onValueChange={setEnvironment}>
  <SelectItem value="sandbox">Sandbox</SelectItem>
  <SelectItem value="live">Production</SelectItem>
</Select>

// URL-based routing
const baseUrl = environment === 'sandbox' ? '/sandbox' : '/live';
navigate(`${baseUrl}/products`);
```

#### 4. Stripe Integration
```typescript
// Switches Stripe configuration based on environment
const stripeConfig = environment === 'sandbox'
  ? organization.test_stripe_connect
  : organization.live_stripe_connect;

const stripe = new Stripe(stripeConfig.api_key);
```

### Pros of Autumn's Approach

1. **Single Infrastructure**: Lower operational costs
2. **Easy Data Comparison**: Can query across environments
3. **Shared User Accounts**: Same login for both environments
4. **Quick Switching**: Instant toggle between environments
5. **Configuration Flexibility**: Per-organization test/live settings

### Cons of Autumn's Approach

1. **Data Mixing Risk**: Test and live data in same tables
2. **Complex Queries**: Need environment checks everywhere
3. **Performance Impact**: Test data affects production queries
4. **No True Isolation**: Shared database = shared risk
5. **Backup Complexity**: Can't backup just production data

---

## Flowglad's Implementation

### Architecture Overview

Flowglad uses a **single database with row-level separation** using a `livemode` boolean flag on all tables.

```
┌─────────────────────┐
│   Single Database   │
├─────────────────────┤
│    All Tables       │
│  - livemode: bool   │
│  - other columns    │
└─────────────────────┘
         ↓
    RLS Policies
    Filter by
    livemode
         ↓
    app.livemode
    Session Setting
```

### Key Components

#### 1. Database Schema
```sql
-- Base table structure shared by all tables
CREATE TABLE table_base (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  livemode BOOLEAN NOT NULL DEFAULT false
);

-- Every business table inherits this
CREATE TABLE products (
  LIKE table_base INCLUDING ALL,
  name TEXT,
  price DECIMAL
);

-- Index for performance
CREATE INDEX idx_products_livemode ON products(organization_id, livemode);
```

#### 2. Row-Level Security
```sql
-- RLS policy checks current session setting
CREATE POLICY products_policy ON products
  USING (
    livemode = current_setting('app.livemode')::boolean
  );

-- Set at session start
SET app.livemode = 'true'; -- or 'false' for sandbox
```

#### 3. API Implementation
```typescript
// Middleware sets database session variable
async function setEnvironmentContext(req, res, next) {
  const livemode = req.apiKey.startsWith('live_');

  // Set for this database session
  await db.query(`SET app.livemode = '${livemode}'`);

  req.livemode = livemode;
  next();
}
```

#### 4. Stripe Webhook Handling
```typescript
// Stripe events include livemode flag
webhook.post('/stripe', (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, secret);

  // Store with correct livemode
  await db.events.create({
    ...event,
    livemode: event.livemode  // Stripe provides this
  });
});
```

### Pros of Flowglad's Approach

1. **Automatic Filtering**: RLS handles separation transparently
2. **Consistent Schema**: Same structure for all environments
3. **Stripe Alignment**: Matches Stripe's livemode pattern
4. **Single Codebase**: No branching logic for environments
5. **Gradual Migration**: Can add livemode to existing tables

### Cons of Flowglad's Approach

1. **Performance Overhead**: Every query needs livemode filter
2. **Bloated Tables**: Test data makes tables larger
3. **Risk of Mistakes**: Forgetting livemode filter = data leak
4. **Complex Migrations**: Need to set livemode on all rows
5. **No Physical Isolation**: Still sharing same database

---

## Comparison Matrix

| Aspect | Autumn | Flowglad | BillingOS (Proposed) |
|--------|---------|----------|---------------------|
| **Architecture** | Single DB, config flags | Single DB, livemode column | Separate infrastructure |
| **Data Isolation** | Configuration-based | Row-level (RLS) | Complete physical isolation |
| **Performance** | Good (some overhead) | Moderate (filter overhead) | Excellent (separated) |
| **Complexity** | Moderate | High (RLS policies) | Low (simple routing) |
| **Risk Level** | Medium | Medium-High | Very Low |
| **Cost** | Low | Low | Medium (~$30-45/month) |
| **Switching UX** | Instant | Instant | Instant (with reload) |
| **Auth Approach** | Shared | Shared | Shared (JWT secret) |
| **Maintenance** | Moderate | High (RLS complexity) | Low |
| **Debugging** | Harder (mixed data) | Harder (mixed data) | Easy (separated) |
| **Compliance** | Challenging | Challenging | Easy (physical separation) |
| **Scalability** | Limited | Limited | Independent scaling |

---

## Why BillingOS Chose Separate Infrastructure

### 1. Industry Best Practice

Major payment platforms use separate infrastructure:
- **Stripe**: Completely separate test and live modes
- **PayPal**: sandbox.paypal.com vs api.paypal.com
- **Plaid**: sandbox.plaid.com for testing
- **Twilio**: Separate test credentials and infrastructure

### 2. Zero Risk Architecture

With separate infrastructure:
- **Impossible** to accidentally process test payments as real
- **Impossible** to show test data in production
- **Impossible** to leak data between environments
- No need to worry about livemode filters

### 3. Superior Developer Experience

- **Clear Mental Model**: Separate = separate
- **Easy Debugging**: Know exactly which environment has issues
- **Simple Queries**: No livemode checks needed
- **Fast Development**: No fear of breaking production

### 4. Better Performance

- Production queries only touch production data
- No test data bloating indexes
- Can optimize each environment independently
- Can scale environments separately

### 5. Compliance & Security

- Physical isolation satisfies compliance requirements
- Easier to pass security audits
- Can have different security policies per environment
- Sandbox can have relaxed security for testing

---

## Implementation Complexity Analysis

### Autumn's Approach - Implementation Effort

**Frontend**: ⭐⭐⭐ (Moderate)
- Environment switcher component
- Conditional routing logic
- API key management UI

**Backend**: ⭐⭐⭐⭐ (Complex)
- Environment detection middleware
- Dual Stripe configuration
- Complex service logic

**Database**: ⭐⭐ (Simple)
- Add configuration columns
- No structural changes

**Maintenance**: ⭐⭐⭐⭐ (Complex)
- Keep test/live logic synchronized
- Debug mixed data issues

### Flowglad's Approach - Implementation Effort

**Frontend**: ⭐⭐ (Simple)
- Basic environment toggle
- Minimal UI changes

**Backend**: ⭐⭐⭐ (Moderate)
- Session management for livemode
- Consistent livemode passing

**Database**: ⭐⭐⭐⭐⭐ (Very Complex)
- Add livemode to ALL tables
- Create RLS policies for everything
- Migrate existing data

**Maintenance**: ⭐⭐⭐⭐⭐ (Very Complex)
- Manage RLS policies
- Ensure livemode consistency
- Debug filter issues

### BillingOS Approach - Implementation Effort

**Frontend**: ⭐⭐ (Simple)
- Environment toggle component
- Dynamic API routing

**Backend**: ⭐ (Very Simple)
- Deploy twice with different env vars
- No code changes needed

**Database**: ⭐ (Very Simple)
- Create second Supabase project
- Run same migrations

**Maintenance**: ⭐ (Very Simple)
- Independent environments
- Clear separation
- Easy debugging

---

## Cost-Benefit Analysis

### Autumn/Flowglad Approach Costs

**Hidden Costs:**
- Developer time debugging mixed data: ~5-10 hours/month
- Performance degradation over time: ~10-20% slower queries
- One production incident from mixed data: $1000s in lost revenue
- Compliance audit failures: $10,000s in remediation

**Actual Monthly Cost**: $0 (infrastructure) + significant hidden costs

### BillingOS Approach Costs

**Direct Costs:**
- Supabase sandbox: $25/month
- Railway sandbox: $5-20/month
- **Total**: ~$30-45/month

**Benefits:**
- Zero risk of data mixing
- Faster development (no fear)
- Better performance
- Easy compliance
- Peace of mind: **Priceless**

**ROI**: The first prevented incident pays for years of sandbox infrastructure

---

## Recommendations for BillingOS

### Why We Chose Separate Infrastructure

1. **Safety First**: Payment systems need maximum safety
2. **Industry Standard**: Follow what Stripe/PayPal do
3. **Simple is Better**: Less complexity = fewer bugs
4. **Cost is Negligible**: $45/month is nothing for a SaaS
5. **Future Proof**: Easy to scale and maintain

### What We Learned from Autumn/Flowglad

#### From Autumn:
- ✅ API key prefix pattern (sk_test_* vs sk_live_*)
- ✅ Environment toggle UI component
- ✅ Visual indicators for test mode
- ❌ Don't mix test/live in same database

#### From Flowglad:
- ✅ Consistent environment handling
- ✅ Stripe livemode alignment
- ❌ Don't rely on RLS for environment separation
- ❌ Don't mix data in same tables

### Our Hybrid Approach

BillingOS takes the best ideas from both:
1. **Autumn's API key pattern** for environment detection
2. **Autumn's UI approach** for environment switching
3. **Flowglad's consistency** in environment handling
4. **Neither's database approach** - we use separate infrastructure

---

## Conclusion

While Autumn and Flowglad's approaches work for their use cases, BillingOS benefits from complete infrastructure separation because:

1. **We're a payment platform** - safety is paramount
2. **We're early stage** - can make the right choice now
3. **Cost is minimal** - $45/month is insignificant
4. **Simplicity wins** - less complexity = better product

The separate infrastructure approach gives us:
- ✅ Zero risk of data contamination
- ✅ Better performance
- ✅ Easier debugging
- ✅ Simpler codebase
- ✅ Industry-standard architecture
- ✅ Peace of mind

This is the right architectural decision for BillingOS's long-term success.