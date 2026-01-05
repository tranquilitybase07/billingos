# BillingOS Hybrid Architecture

**Date:** January 3, 2026
**Architecture Type:** Hybrid (Stripe Connect + PostgreSQL Cache + AI Layer)
**Design Philosophy:** Stripe for reliability, PostgreSQL for speed, AI for intelligence

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [System Layers](#system-layers)
3. [Data Flow Patterns](#data-flow-patterns)
4. [Stripe Connect Integration](#stripe-connect-integration)
5. [Caching Strategy](#caching-strategy)
6. [Webhook Sync Pattern](#webhook-sync-pattern)
7. [Reconciliation System](#reconciliation-system)
8. [Intelligence Layer](#intelligence-layer)

---

## Architecture Overview

### The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Merchant Web │  │ Merchant SDK │  │ End User     │     │
│  │  Dashboard   │  │  (Node/React)│  │  Portal      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          │ HTTPS/REST       │ HTTPS/REST       │ HTTPS
          ↓                  ↓                  ↓
┌─────────────────────────────────────────────────────────────┐
│              BILLINGOS API (NestJS)                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Authentication & Authorization                     │    │
│  │  - JWT (Supabase Auth)                             │    │
│  │  - Organization-scoped access                      │    │
│  │  - Rate limiting per merchant                      │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌───────────────────┐  ┌───────────────────────────┐     │
│  │  Read Path        │  │  Write Path               │     │
│  │  (Fast - Cache)   │  │  (Reliable - Stripe)      │     │
│  │                   │  │                           │     │
│  │  GET /subs/:id    │  │  POST /subs/create       │     │
│  │  GET /entitle/... │  │  POST /usage/track       │     │
│  │  GET /customers   │  │  POST /subs/cancel       │     │
│  │                   │  │                           │     │
│  │  ↓ 2-5ms          │  │  ↓ 50-200ms              │     │
│  └───────────────────┘  └───────────────────────────┘     │
└──────┬────────────────────┬──────────────────┬─────────────┘
       │                    │                  │
       │                    │                  │
   READ│               WRITE│            ASYNC │
       ↓                    ↓                  ↓
┌──────────────┐   ┌─────────────────┐  ┌────────────────┐
│    REDIS     │   │  STRIPE API     │  │  BULLMQ QUEUE  │
│  (Hot Cache) │   │  (via Connect)  │  │  (Background)  │
│              │   │                 │  │                │
│ - Entitle    │   │ - Subscriptions │  │ - Webhooks     │
│ - Usage      │   │ - Customers     │  │ - Sync jobs    │
│ - Sessions   │   │ - Invoices      │  │ - AI jobs      │
│              │   │ - Meters        │  │ - Alerts       │
│ TTL: 5-60min │   │                 │  │                │
└──────┬───────┘   └────────┬────────┘  └───────┬────────┘
       │                    │                    │
       │                    │                    │
       ↓                    ↓                    ↓
┌─────────────────────────────────────────────────────────────┐
│              POSTGRESQL (Supabase)                          │
│              Source of Truth for Reads                      │
│                                                              │
│  Core Tables:                                               │
│  ├─ merchants (organizations using BillingOS)              │
│  ├─ customers (end users of merchants)                     │
│  ├─ subscriptions (cached from Stripe)                     │
│  ├─ entitlements (feature access)                          │
│  ├─ usage_records (metering data)                          │
│  ├─ webhook_events (audit log)                             │
│  └─ ai_insights (predictions & recommendations)            │
└─────────────────────────────────────────────────────────────┘
```

---

## System Layers

### Layer 1: Client Applications

**Merchant Dashboard (Next.js)**
- Revenue analytics
- Customer insights
- AI-powered alerts
- Subscription management

**Merchant SDK (@billingos/sdk)**
```typescript
// Minimal snippet - illustrative only
import { BillingOS } from '@billingos/sdk';

const billingos = new BillingOS({
  accessToken: process.env.BILLINGOS_ACCESS_TOKEN
});

// Fast entitlement check (2-5ms from cache)
const hasPremium = await billingos.hasFeature(userId, 'premium');
```

**End User Portal**
- View subscription
- Update payment method
- View invoices
- Manage account

### Layer 2: API Gateway (NestJS)

**Responsibilities:**
- Request authentication & authorization
- Route to appropriate service
- Cache management (Redis)
- Response formatting

**Key Modules:**
- `customer/` - Customer CRUD
- `subscription/` - Subscription management
- `usage/` - Usage tracking
- `entitlement/` - Feature access checks
- `webhook/` - Stripe event processing
- `analytics/` - Revenue & usage analytics

### Layer 3: Data Layer

**Redis (Hot Cache)**
- Frequently accessed data (entitlements, sessions)
- TTL: 5-60 minutes depending on data type
- Invalidated on writes

**PostgreSQL (Durable Cache)**
- All Stripe data mirrored locally
- Optimized for fast reads
- Updated via webhooks + reconciliation

**Stripe API (Source of Truth for Writes)**
- All mutations go through Stripe first
- Stripe manages payment processing
- Webhooks notify us of changes

---

## Data Flow Patterns

### Pattern 1: Read Path (Fast - Cache Hit)

```
User Request
    ↓
API: Check Redis cache
    ↓
Redis: Cache hit! (2ms)
    ↓
API: Return response
```

**Latency:** 2-5ms (excellent UX)
**Hit Rate:** 95%+ (Redis)

### Pattern 2: Read Path (Cache Miss)

```
User Request
    ↓
API: Check Redis cache
    ↓
Redis: Cache miss
    ↓
API: Query PostgreSQL
    ↓
PostgreSQL: Return data (5ms)
    ↓
API: Populate Redis cache
    ↓
API: Return response
```

**Latency:** 5-15ms (still fast)
**Hit Rate:** 4% (PostgreSQL fallback)

### Pattern 3: Read Path (Full Miss - Rare)

```
User Request
    ↓
API: Check Redis → miss
    ↓
API: Check PostgreSQL → miss
    ↓
API: Fetch from Stripe API (50-200ms)
    ↓
API: Store in PostgreSQL
    ↓
API: Populate Redis
    ↓
API: Return response
```

**Latency:** 50-200ms (rare, cold start)
**Hit Rate:** <1% (new data)

### Pattern 4: Write Path (Dual-Write)

```
User Request (Create Subscription)
    ↓
API: Validate input
    ↓
1. Write to Stripe API (primary)
    ↓
   Stripe: Returns subscription object
    ↓
2. Immediately cache in PostgreSQL
    ↓
3. Invalidate Redis cache
    ↓
API: Return response (fast!)
    ↓
(Later) Webhook arrives → confirms/updates
```

**Key Principle:** Stripe is source of truth, DB is immediate cache

**Code Snippet (Illustrative):**
```typescript
// Step 1: Create in Stripe (source of truth)
const stripeSubscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: stripePriceId }],
  metadata: { merchant_id, customer_id }
}, {
  stripeAccount: merchant.stripe_account_id // Connect!
});

// Step 2: Cache in DB immediately (don't wait for webhook)
await db.subscriptions.create({
  stripe_subscription_id: stripeSubscription.id,
  merchant_id,
  customer_id,
  status: stripeSubscription.status,
  // ... other fields
});

// Step 3: Invalidate Redis
await redis.del(`customer:${customer_id}:subscription`);

// Webhook will confirm/update this later
```

---

## Stripe Connect Integration

### Account Hierarchy

```
Your Platform Stripe Account (stripe_platform_id)
  │
  ├─ Organization 1 Connect Account (acct_xxx1) ✅ Already implemented!
  │   ├─ Customer A (cus_xxx)
  │   │   └─ Subscription (sub_xxx)
  │   │       ├─ Active entitlements
  │   │       └─ Usage meters
  │   └─ Customer B (cus_yyy)
  │
  └─ Organization 2 Connect Account (acct_xxx2)
      └─ Customers...
```

### Key Pattern: `stripeAccount` Header

**Every Stripe API call includes the Connect account ID:**

```typescript
// Create customer in merchant's Connect account
const customer = await stripe.customers.create(
  {
    email: 'user@example.com',
    metadata: { merchant_customer_id: 'user_123' }
  },
  {
    stripeAccount: merchant.stripe_account_id // ← Critical!
  }
);
```

**Why This Works:**
- Each merchant's data is isolated in their Connect account
- BillingOS manages all accounts via platform credentials
- Merchants never see Stripe - pure white-label experience

### Connect Account Creation (Already Done!)

**File:** `apps/api/src/account/account.service.ts`

We already create Express Connect accounts when organizations sign up:
- Account type: `express` (simplified onboarding)
- Capabilities: `card_payments`, `transfers`
- Onboarding: Stripe-hosted flow
- Dashboard: Login links for merchants (optional)

**What We Need to Add:**
- Create customers in these Connect accounts
- Create subscriptions for those customers
- Track entitlements and usage

---

## Caching Strategy

### Three-Tier Cache Architecture

**Tier 1: Redis (Hot Cache)**
- **Purpose:** Ultra-fast reads for frequently accessed data
- **TTL:** 5-60 minutes (varies by data type)
- **Data:** Entitlements, user sessions, rate limit counters

**Tier 2: PostgreSQL (Durable Cache)**
- **Purpose:** Fast reads with persistence
- **TTL:** Indefinite (synced via webhooks)
- **Data:** Subscriptions, customers, usage records, invoices

**Tier 3: Stripe API (Source of Truth)**
- **Purpose:** Writes and cold reads
- **TTL:** N/A (primary source)
- **Data:** Everything (authoritative)

### Cache Invalidation Rules

**On Subscription Update:**
```typescript
// 1. Update in Stripe
const updated = await stripe.subscriptions.update(subId, {...});

// 2. Update PostgreSQL
await db.subscriptions.update(subId, {...});

// 3. Invalidate Redis
await redis.del(`subscription:${subId}`);
await redis.del(`customer:${customerId}:subscriptions`);
await redis.del(`entitlements:${customerId}`);
```

**On Webhook Event:**
```typescript
// Webhook handler invalidates related caches
if (event.type === 'customer.subscription.updated') {
  await redis.del(`subscription:${subscription.id}`);
  await redis.del(`entitlements:${subscription.customer}`);
}
```

### Cache Key Patterns

```
# Subscriptions
subscription:{subscription_id}
customer:{customer_id}:subscriptions

# Entitlements
entitlements:{customer_id}
entitlement:{customer_id}:{feature_key}

# Usage
usage:{customer_id}:{metric}:{period}

# Rate limiting
ratelimit:{merchant_id}:{endpoint}:{window}
```

---

## Webhook Sync Pattern

### Webhook Flow

```
Stripe Event Occurs
    ↓
Stripe → POST /api/webhooks/stripe
    ↓
1. Verify signature
    ↓
2. Check for duplicate (idempotency)
    ↓
3. Store in webhook_events table
    ↓
4. Enqueue background job (BullMQ)
    ↓
5. Return 200 OK (fast!)
    ↓
(Async) Background worker processes event
    ↓
6. Update PostgreSQL
    ↓
7. Invalidate Redis cache
    ↓
8. Mark webhook as processed
```

### Events We Handle

**Subscription Events:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

**Payment Events:**
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

**Entitlement Events:**
- `entitlements.active_entitlement_summary.updated`

**Account Events (Already Implemented!):**
- `account.updated`
- `account.external_account.created`

### Code Snippet (Illustrative)

```typescript
// Webhook handler
async handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  // Update PostgreSQL cache
  await this.db.subscriptions.update({
    where: { stripe_subscription_id: subscription.id },
    data: {
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000),
      synced_at: new Date()
    }
  });

  // Invalidate Redis
  await this.redis.del(`subscription:${subscription.id}`);
  await this.redis.del(`entitlements:${subscription.customer}`);

  // Update entitlements if status changed
  if (subscription.status === 'active') {
    await this.entitlementService.grant(subscription);
  } else if (subscription.status === 'canceled') {
    await this.entitlementService.revoke(subscription);
  }
}
```

---

## Reconciliation System

### Hourly Reconciliation Job

**Purpose:** Catch any missed webhooks or sync failures

**Process:**
```
Every hour:
1. Query recent subscriptions from PostgreSQL
2. For each subscription:
   a. Fetch from Stripe API
   b. Compare status, period_end, etc.
   c. If different → log discrepancy
   d. Update PostgreSQL with Stripe data (Stripe wins!)
   e. Invalidate cache
3. Send alert if >5 discrepancies found
```

**Code Snippet (Illustrative):**
```typescript
// Runs hourly via cron
@Cron('0 * * * *') // Every hour
async reconcileSubscriptions() {
  const recentSubs = await this.db.subscriptions.findMany({
    where: {
      updated_at: { gte: hoursAgo(2) } // Check last 2 hours
    }
  });

  for (const sub of recentSubs) {
    const stripeSub = await this.stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
      { stripeAccount: sub.merchant.stripe_account_id }
    );

    if (sub.status !== stripeSub.status) {
      // Log discrepancy
      this.logger.warn(`Subscription ${sub.id} out of sync`);

      // Stripe wins - update our DB
      await this.syncSubscription(stripeSub);
    }
  }
}
```

### Reconciliation Metrics

**Track:**
- Number of discrepancies per hour
- Types of discrepancies (status, amount, period)
- Resolution time

**Alerts:**
- Slack notification if >10 discrepancies/hour
- PagerDuty if >50 discrepancies/hour (critical)

---

## Intelligence Layer

### Where AI Lives

**PostgreSQL = AI's Data Source**

The entire intelligence layer queries PostgreSQL (not Stripe):
- Faster queries (no API rate limits)
- Complex aggregations (SQL joins)
- Historical analysis (data retention)
- Real-time insights (no external API latency)

### AI Features

**1. Churn Prediction**
```sql
-- Daily cron: Find at-risk customers
SELECT c.*, s.*,
       (SELECT COUNT(*) FROM usage_records WHERE customer_id = c.id AND period = current_month) as usage_count
FROM customers c
JOIN subscriptions s ON s.customer_id = c.id
WHERE s.status = 'active'
  AND usage_count < (avg_usage * 0.3) -- 70% drop in usage
```

Feed to ML model → predict churn probability → create alert

**2. Upgrade Opportunities**
```sql
-- Find customers hitting plan limits
SELECT c.*, u.metric, u.quantity, u.limit_quantity
FROM customers c
JOIN usage_records u ON u.customer_id = c.id
WHERE u.quantity >= (u.limit_quantity * 0.9) -- 90% of limit
  AND s.plan_slug = 'starter'
```

Generate personalized upgrade recommendation

**3. Revenue Analytics**
```sql
-- Calculate MRR
SELECT
  DATE_TRUNC('month', s.current_period_start) as month,
  SUM(s.amount) / 100.0 as mrr
FROM subscriptions s
WHERE s.status IN ('active', 'trialing')
GROUP BY month
ORDER BY month DESC;
```

**Key Insight:** All analytics run on PostgreSQL, not Stripe API!

---

## Key Architectural Decisions

### ✅ Why Hybrid Works

1. **Speed:** PostgreSQL/Redis cache gives us 2-5ms responses
2. **Reliability:** Stripe handles payment processing (PCI compliance)
3. **Scalability:** 99% of queries hit our DB (no Stripe rate limits)
4. **Intelligence:** Run complex AI/ML on cached data
5. **Migration Path:** DB schema ready for full ownership

### ✅ Why Stripe Connect

1. **White-label:** Merchants never see Stripe branding
2. **Isolation:** Each merchant's data in separate Connect account
3. **Security:** We manage one set of credentials
4. **Compliance:** Stripe handles KYC, AML, etc.

### ✅ Why Dual-Write

1. **Consistency:** Stripe is source of truth
2. **Performance:** DB cache gives instant reads
3. **Resilience:** Webhooks confirm async
4. **Reconciliation:** Hourly job catches any issues

---

## Performance Characteristics

### Expected Latencies

| Operation | Latency | Cache Hit |
|-----------|---------|-----------|
| Check entitlement | 2-5ms | Redis (95%) |
| Get subscription | 5-10ms | PostgreSQL (4%) |
| Create subscription | 200-500ms | Stripe API |
| Track usage | 50-100ms | Stripe Meter API |
| Analytics query | 10-50ms | PostgreSQL |

### Scalability Limits (Hybrid Mode)

**Bottlenecks:**
- Stripe API rate limits: 100 req/sec per Connect account
- PostgreSQL: 10,000 queries/sec (plenty of headroom)
- Redis: 100,000 ops/sec (no concern)

**When to Migrate:**
- 500+ merchants × 100 req/sec = 50,000 req/sec to Stripe
- At that point, migrate to full DB ownership

---

## Security Considerations

### Data Encryption

**At Rest:**
- PostgreSQL: Encrypted (Supabase default)
- Redis: Encrypted connections (TLS)
- Stripe tokens: Encrypted in DB

**In Transit:**
- HTTPS only (TLS 1.3)
- Webhook signatures verified
- JWT tokens for API auth

### Access Control

**Merchants:**
- Can only access their own Connect account data
- JWT scoped to organization_id
- RLS policies in PostgreSQL

**End Users:**
- Customer session tokens (time-limited)
- Can only access their own subscription data
- No direct Stripe access

---

## Monitoring & Observability

### Key Metrics

**Performance:**
- API response time (p50, p95, p99)
- Cache hit rate (Redis, PostgreSQL)
- Webhook processing time

**Reliability:**
- Webhook success rate
- Reconciliation discrepancies
- Stripe API error rate

**Business:**
- Active subscriptions
- Churn rate
- MRR growth

### Alerting

**Critical:**
- Webhook processing failures >5% (PagerDuty)
- Reconciliation discrepancies >50/hour (PagerDuty)
- API error rate >1% (Slack)

**Warning:**
- Cache hit rate <90% (Slack)
- Webhook backlog >100 events (Slack)

---

## Summary

### The Hybrid Architecture Gives Us:

✅ **Speed:** 2-5ms entitlement checks (Redis cache)
✅ **Reliability:** Stripe handles payments (battle-tested)
✅ **Scalability:** 99% queries hit our DB (no rate limits)
✅ **Intelligence:** AI/ML on PostgreSQL (fast, flexible)
✅ **White-label:** Merchants see BillingOS, not Stripe
✅ **Migration Path:** Ready to own subscriptions at scale

### Next Steps:

1. **Review this architecture** with the team
2. **Read implementation roadmap** (02-implementation-roadmap.md)
3. **Assign tasks** to 4 developers
4. **Start building!**

---

**Read Next:**
- `02-implementation-roadmap.md` - Week-by-week tasks
- `03-migration-strategy.md` - Future migration plan
- `04-next-steps.md` - Immediate actions
