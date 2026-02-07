# Analytics API - Phase 2 Plan

**Date Created:** February 7, 2026
**Status:** Planning → Implementation
**Estimated Time:** 6-8 hours

---

## Overview

Phase 2 builds on the Phase 1 foundation (MRR, Active Subscriptions, Revenue Trend, Subscription Growth) by adding advanced business metrics and database optimizations.

**Phase 1 Deliverables (COMPLETED):**
- ✅ MRR with interval normalization
- ✅ Active subscriptions count
- ✅ Revenue trend (time-series)
- ✅ Subscription growth tracking
- ✅ Redis caching (5-15 min TTLs)

**Phase 2 Goals:**
1. Add 3 new advanced metrics endpoints
2. Optimize database queries with indexes
3. Improve caching strategy with pattern-based invalidation
4. Add comprehensive API documentation

---

## Phase 2 Features

### 1. Churn Rate Calculation

**Endpoint:** `GET /analytics/churn-rate`

**Query Parameters:**
- `organization_id` (required)
- `start_date` (optional, defaults to 30 days ago)
- `end_date` (optional, defaults to today)
- `granularity` (optional: day/week/month, defaults to month)

**Business Logic:**
```
Churn Rate = (Canceled Subscriptions / Active at Start of Period) * 100

For each period:
1. Count active subscriptions at start of period
2. Count new subscriptions during period
3. Count canceled subscriptions during period
4. Calculate: churn_rate = (canceled / active_at_start) * 100
5. Calculate: retention_rate = 100 - churn_rate
```

**Response Schema:**
```typescript
{
  data: [
    {
      date: "2026-02",
      active_at_start: 150,
      new_subscriptions: 20,
      canceled_subscriptions: 10,
      churn_rate: 6.67,
      retention_rate: 93.33
    }
  ],
  summary: {
    avg_churn_rate: 6.5,
    avg_retention_rate: 93.5,
    total_periods: 3
  },
  period: { start: "2026-01-01", end: "2026-02-07" },
  granularity: "month"
}
```

**Implementation Notes:**
- Use CTE pattern for cleaner SQL (active_at_start requires subquery)
- Cache for 15 minutes (same as other time-series)
- Depends on subscriptions table only

---

### 2. Top Customers by Revenue

**Endpoint:** `GET /analytics/customers/top-revenue`

**Query Parameters:**
- `organization_id` (required)
- `start_date` (optional, defaults to all-time)
- `end_date` (optional, defaults to today)
- `limit` (optional, defaults to 10, max 100)

**Business Logic:**
```sql
SELECT
  c.id,
  c.email,
  c.name,
  SUM(pi.amount) as total_revenue,
  COUNT(pi.id) as transaction_count
FROM customers c
JOIN payment_intents pi ON pi.customer_id = c.id
WHERE
  c.organization_id = :organization_id
  AND pi.status = 'succeeded'
  AND pi.created_at BETWEEN :start_date AND :end_date
GROUP BY c.id, c.email, c.name
ORDER BY total_revenue DESC
LIMIT :limit
```

**Response Schema:**
```typescript
{
  data: [
    {
      customer_id: "uuid",
      email: "customer@example.com",
      name: "Acme Corp",
      total_revenue: 50000,
      transaction_count: 24,
      rank: 1
    }
  ],
  summary: {
    total_customers: 250,
    top_10_revenue: 150000,
    top_10_percentage: 45.5
  },
  period: { start: "2026-01-01", end: "2026-02-07" }
}
```

**Implementation Notes:**
- Cache for 30 minutes (less volatile than MRR)
- Invalidate when payment_intent succeeds
- Filter by date range for flexibility

---

### 3. ARPU (Average Revenue Per User)

**Endpoint:** `GET /analytics/arpu`

**Query Parameters:**
- `organization_id` (required)

**Business Logic:**
```
ARPU = MRR / Active Customers Count

Steps:
1. Get MRR from existing endpoint (or calculate directly)
2. Count distinct customers with active subscriptions
3. Calculate: arpu = mrr / active_customers
```

**Response Schema:**
```typescript
{
  arpu: 4500,
  mrr: 135000,
  active_customers: 30,
  currency: "usd",
  cached_at: "2026-02-07T10:00:00Z"
}
```

**Implementation Notes:**
- Reuse MRR calculation logic
- Cache for 5 minutes (same as MRR)
- Simple metric but very important for SaaS

---

### 4. Database Optimization

**Goal:** Reduce query times by 50-70% with covering indexes

**Indexes to Add:**

```sql
-- 1. MRR query optimization (subscriptions JOIN products)
CREATE INDEX IF NOT EXISTS idx_subscriptions_mrr
ON subscriptions(organization_id, status, cancel_at_period_end, deleted_at, product_id)
WHERE deleted_at IS NULL;

-- 2. Revenue trend optimization (payment_intents by date)
CREATE INDEX IF NOT EXISTS idx_payment_intents_revenue_trend
ON payment_intents(organization_id, status, created_at, amount)
WHERE status = 'succeeded';

-- 3. Subscription growth optimization (created_at and canceled_at)
CREATE INDEX IF NOT EXISTS idx_subscriptions_growth_created
ON subscriptions(organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_growth_canceled
ON subscriptions(organization_id, canceled_at)
WHERE canceled_at IS NOT NULL;

-- 4. Top customers optimization (customer_id aggregation)
CREATE INDEX IF NOT EXISTS idx_payment_intents_customer_revenue
ON payment_intents(customer_id, organization_id, status, amount, created_at)
WHERE status = 'succeeded';

-- 5. Active subscriptions count optimization
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_count
ON subscriptions(organization_id, status, deleted_at)
WHERE deleted_at IS NULL AND status IN ('active', 'trialing');
```

**Migration File:** `supabase/migrations/YYYYMMDDHHMMSS_add_analytics_indexes.sql`

**Expected Performance Improvements:**
- MRR query: 500ms → ~100ms (5x faster)
- Revenue trend: 300ms → ~80ms (4x faster)
- Subscription growth: 300ms → ~70ms (4x faster)
- Top customers: 200ms → ~50ms (4x faster)

---

### 5. Advanced Caching Strategy

**Pattern-Based Cache Invalidation:**

Currently, we only invalidate specific keys. Phase 2 will add Redis-specific pattern deletion:

```typescript
import Redis from 'ioredis';

async invalidateAnalyticsCacheAdvanced(organizationId: string): Promise<void> {
  // Get Redis client directly
  const redis = new Redis(process.env.REDIS_URL);

  // Delete all cache keys matching patterns
  const patterns = [
    `analytics:${organizationId}:*`,  // All analytics for this org
  ];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  this.logger.log(`Invalidated ${keys.length} analytics cache keys for org ${organizationId}`);
}
```

**Granular Invalidation Hooks:**
- `onSubscriptionCreated` → Invalidate: MRR, active subs, ARPU, sub growth
- `onSubscriptionCanceled` → Invalidate: MRR, active subs, ARPU, sub growth, churn
- `onPaymentSucceeded` → Invalidate: Revenue trend, top customers
- `onCustomerCreated` → Invalidate: Customer-related metrics only

---

## Implementation Steps

### Step 1: Database Indexes (30 min)
1. Create migration file with all indexes
2. Run migration locally
3. Verify indexes with `EXPLAIN ANALYZE`
4. Benchmark query performance before/after

### Step 2: Churn Rate Endpoint (2 hours)
1. Create `ChurnRateResponseDto`
2. Implement `getChurnRate()` in analytics.service.ts
3. Add controller method with validation
4. Add Redis caching
5. Write tests

### Step 3: Top Customers Endpoint (1.5 hours)
1. Create `TopCustomersResponseDto`
2. Implement `getTopCustomers()` in analytics.service.ts
3. Add controller method with limit validation
4. Add Redis caching
5. Write tests

### Step 4: ARPU Endpoint (1 hour)
1. Create `ARPUResponseDto`
2. Implement `getARPU()` in analytics.service.ts
3. Reuse MRR calculation logic
4. Add controller method
5. Add Redis caching

### Step 5: Advanced Cache Invalidation (1.5 hours)
1. Add ioredis dependency
2. Create pattern-based invalidation method
3. Add hooks to subscriptions service
4. Add hooks to stripe webhook service
5. Test invalidation triggers

### Step 6: Testing & Documentation (2 hours)
1. Manual testing of all 3 new endpoints
2. Performance benchmarking with indexes
3. Update progress.md with Phase 2 status
4. Create API documentation with examples
5. Update sprint docs

---

## DTOs to Create

```typescript
// dto/churn-rate-response.dto.ts
export class ChurnRateDataPoint {
  date: string;
  active_at_start: number;
  new_subscriptions: number;
  canceled_subscriptions: number;
  churn_rate: number;
  retention_rate: number;
}

export class ChurnRateResponseDto {
  data: ChurnRateDataPoint[];
  summary: {
    avg_churn_rate: number;
    avg_retention_rate: number;
    total_periods: number;
  };
  period: { start: string; end: string };
  granularity: Granularity;
}

// dto/top-customers-response.dto.ts
export class TopCustomerDto {
  customer_id: string;
  email: string;
  name: string | null;
  total_revenue: number;
  transaction_count: number;
  rank: number;
}

export class TopCustomersResponseDto {
  data: TopCustomerDto[];
  summary: {
    total_customers: number;
    top_n_revenue: number;
    top_n_percentage: number;
  };
  period: { start: string; end: string };
}

// dto/arpu-response.dto.ts
export class ARPUResponseDto {
  arpu: number;
  mrr: number;
  active_customers: number;
  currency: string;
  cached_at: string;
}
```

---

## Testing Checklist

- [ ] All 3 new endpoints return correct data
- [ ] Churn rate calculation is accurate
- [ ] Top customers sorted by revenue DESC
- [ ] ARPU matches MRR / active customers
- [ ] Database indexes improve query performance
- [ ] Cache invalidation triggers work correctly
- [ ] Pattern-based cache deletion works
- [ ] Organization isolation is maintained
- [ ] JWT authentication protects all endpoints
- [ ] Error handling is graceful

---

## Success Criteria

**Phase 2 is complete when:**
1. ✅ 3 new endpoints (churn, top customers, ARPU) are live
2. ✅ Database indexes added and performance improved by 50%+
3. ✅ Advanced cache invalidation implemented with Redis
4. ✅ All endpoints tested and documented
5. ✅ Sprint docs updated with Phase 2 completion

---

## Questions & Decisions

1. **Should churn rate use gross churn or net churn?**
   - **Decision:** Gross churn (canceled / active_at_start)
   - Net churn would require tracking downgrades/upgrades

2. **Should top customers include inactive customers?**
   - **Decision:** Include all customers (filter by payment date range instead)
   - Allows "lifetime value" analysis

3. **Should ARPU be calculated from MRR or actual revenue?**
   - **Decision:** MRR-based ARPU (normalized to monthly)
   - More predictable and standard SaaS metric

4. **Do we need Redis as a separate dependency?**
   - **Decision:** Add `ioredis` for pattern-based cache deletion
   - Minimal overhead, major improvement in cache management

---

**Ready to implement?** Let's start with database indexes first, then build the 3 new endpoints! 🚀
