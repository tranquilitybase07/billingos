# BillingOS Backend Architecture

## Tech Stack Overview

### Core Framework
- **NestJS** (TypeScript-first Node.js framework)
  - Built-in dependency injection
  - Decorators for validation (class-validator)
  - Structured architecture (controllers, services, modules)
  - Superior type safety compared to Express
  - Production-ready for critical billing systems

### Database & Storage
- **Supabase (PostgreSQL)**
  - Primary database for all persistent data
  - Row Level Security (RLS) for multi-tenant isolation
  - Real-time subscriptions for live updates
  - Built-in authentication integration
  - Type generation via `supabase gen types typescript`

### Queue & Job Processing (v1 - Start Simple)
- **pg_cron** (Postgres extension for scheduled jobs)
  - Built into Supabase (no external dependencies)
  - Cron-based job scheduling
  - Automatic failover with Postgres
  - Used for: dunning flows, daily reconciliation, trial notifications

- **PGMQ** (Postgres Message Queue)
  - Postgres-native message queue (AWS SQS-like)
  - Guaranteed delivery with visibility timeout
  - Message durability and archiving
  - Used for: webhook processing, email queues

**Migration Path:** Start with pg_cron + PGMQ, migrate to BullMQ + Redis only when processing > 10,000 jobs/day

### Caching & Rate Limiting (Future - Add When Needed)
- **Redis (Upstash)** - NOT NEEDED FOR V1
  - Add only when: > 100K API calls/day, need sub-second rate limiting
  - Alternative: Use Postgres for initial rate limiting
  - Cost savings: $0 vs $90/month

### Payment Processing
- **Stripe**
  - Checkout sessions
  - Subscription management
  - Webhook events
  - Tax calculation
  - Invoice generation

### Deployment
- **Railway**
  - NestJS backend service
  - PostgreSQL (via Supabase connection)
  - Environment variable management
  - Auto-scaling and monitoring

**Note:** No Redis needed for v1 - everything runs on Postgres via Supabase

---

## Architecture Decision Records

### 1. Why NestJS Over Express?

**Decision:** Use NestJS instead of Express for the backend framework.

**Reasoning:**
- **Type Safety:** NestJS is TypeScript-first with full type inference
- **Validation:** Built-in validation pipes using class-validator
- **Structure:** Opinionated architecture prevents technical debt
- **Reliability:** Better suited for critical billing systems
- **DI:** Dependency injection makes testing easier
- **Ecosystem:** Better integration with TypeORM, BullMQ, etc.

**Trade-offs:**
- Steeper learning curve (but worth it for 4-person team)
- Slightly more boilerplate (but prevents bugs)

---

### 2. pg_cron + PGMQ vs Redis/BullMQ (Start Simple, Scale Later)

**Decision:** Use Supabase built-in pg_cron + PGMQ for v1, migrate to Redis/BullMQ only when metrics prove it's needed.

**v1 Approach (Supabase Built-ins):**

1. **Scheduled Jobs (pg_cron)** - START HERE
   - Dunning email flows (daily at 9 AM)
   - Trial ending notifications (daily check)
   - Daily Stripe reconciliation (3 AM)
   - Database maintenance (vacuuming, cleanup)
   - **Enable:** Supabase Dashboard → Integrations → pg_cron

2. **Message Queues (PGMQ)** - START HERE
   - Webhook processing (guaranteed delivery)
   - Email sending queue
   - Usage aggregation jobs
   - **Enable:** Supabase Dashboard → Integrations → pgmq

3. **Idempotency** - Postgres Table
   - Webhook deduplication via `processed_webhooks` table
   - Unique constraint on `event_id`
   - TTL via `created_at < NOW() - INTERVAL '24 hours'`

4. **Rate Limiting** - Postgres (Initial)
   - Track API calls in `api_usage` table
   - Query count per user per time window
   - Good enough for < 10K requests/day

**When to Migrate to Redis/BullMQ:**

Migrate when you hit **ANY** of these thresholds:

| Metric | Threshold | Why Redis Needed |
|--------|-----------|------------------|
| Jobs/day | > 10,000 | Postgres queues getting slow |
| Queue depth | > 1,000 | Can't keep up with processing |
| API calls/day | > 100,000 | Need atomic rate limiting |
| Job latency | > 5 seconds | Need horizontal worker scaling |
| Real-time requirements | Sub-second | Redis is faster for counters |

**Cost Comparison:**

| Approach | Monthly Cost | When to Use |
|----------|--------------|-------------|
| pg_cron + PGMQ | $0 (included in Supabase) | v1 (< 10K jobs/day) |
| Redis + BullMQ | $90/month (Upstash) | Scale phase (> 10K jobs/day) |

**Savings by starting simple:** $1,080/year in first year

---

### 3. Frontend vs Backend Responsibilities

### Frontend (Next.js + Supabase Client)

**Handles:**
- Display subscription data (read via Supabase RLS)
- Render checkout UI
- Show notifications, usage stats, invoices
- Trigger backend actions via API calls
- Real-time updates (Supabase Realtime)

**Does NOT Handle:**
- Creating checkout sessions (requires secret key)
- Modifying subscriptions (business logic + security)
- Sending emails (API keys must be secret)
- Processing webhooks (server-only operation)

### Backend (NestJS)

**Handles:**
- Stripe webhook handlers (critical)
- Create checkout sessions (secret key required)
- Subscription modifications (upgrade/cancel/downgrade)
- Dunning cron jobs
- Usage tracking and enforcement
- Email sending
- Analytics calculations

**Pattern:**
```
Frontend reads → Supabase (direct, RLS protected)
Frontend writes → Backend API → Supabase + Stripe
Backend jobs → PGMQ queues (Postgres) → Supabase + Stripe
Scheduled tasks → pg_cron (Postgres) → Supabase + Stripe
```

---

### 4. Type Safety Strategy (No ORM)

**Decision:** Use Supabase type generation + Zod validation instead of ORM.

**Implementation:**

1. **Database Schema**
   - Write SQL migrations in `supabase/migrations/*.sql`
   - Use Supabase CLI for migration management

2. **Type Generation**
   ```bash
   supabase gen types typescript --local > packages/shared/types/database.ts
   ```
   - Auto-generated types always in sync with database
   - Shared across frontend and backend

3. **Runtime Validation**
   - Zod schemas in `packages/shared/schemas/*.ts`
   - Validate API inputs/outputs
   - Type inference from schemas

4. **No ORM Needed**
   - Use Supabase client for queries
   - Raw SQL via Postgres functions for complex operations
   - Simpler, more reliable, easier to debug

**Reasoning:**
- ORMs add complexity without clear benefit for billing systems
- Raw SQL is more explicit and easier to optimize
- Supabase type generation provides type safety
- Fewer dependencies = fewer things to break

---

### 5. Webhook Processing Strategy (v1 - Postgres-Native)

**Three-Layer Reliability (Using pg_cron + PGMQ):**

1. **Immediate Processing** (synchronous)
   ```
   Stripe → Webhook endpoint → Verify signature → PGMQ.send() → Return 200
   ```
   - Return 200 OK immediately to Stripe
   - Queue job in PGMQ (Postgres message queue)
   - Never block webhook response

   **Implementation:**
   ```sql
   -- Add webhook to queue
   SELECT pgmq.send('webhook_processing',
     jsonb_build_object('event_id', 'evt_123', 'type', 'invoice.paid')
   );
   ```

2. **Queue-Based Processing** (async via PGMQ + polling)
   ```
   PGMQ queue → Process webhook → Update Supabase → Update Stripe if needed
   ```
   - Worker polls PGMQ every 10 seconds
   - PGMQ provides visibility timeout (30 seconds)
   - Idempotency via `processed_webhooks` table (unique constraint on `event_id`)
   - Error logging in `webhook_errors` table

   **Implementation:**
   ```sql
   -- Poll queue (in NestJS worker)
   SELECT * FROM pgmq.read('webhook_processing', vt => 30, qty => 10);

   -- Mark as processed
   DELETE FROM pgmq.q_webhook_processing WHERE msg_id = $1;
   ```

3. **Daily Reconciliation** (via pg_cron)
   ```
   pg_cron (3 AM daily) → Fetch Stripe subscriptions → Compare → Fix discrepancies
   ```
   - Scheduled via pg_cron (Postgres cron extension)
   - Catches any missed webhooks
   - Ensures data consistency

   **Implementation:**
   ```sql
   -- Schedule reconciliation job
   SELECT cron.schedule(
     'stripe-reconciliation',
     '0 3 * * *', -- 3 AM daily
     $$ SELECT reconcile_stripe_data(); $$
   );
   ```

**Why This Approach:**
- ✅ Zero external dependencies (no Redis needed)
- ✅ Guaranteed delivery (PGMQ provides this)
- ✅ Automatic failover with Postgres
- ✅ Sufficient for < 10K webhooks/day
- ⚠️ Migrate to BullMQ when processing > 10K webhooks/day

---

### 6. Deployment Architecture

**Services:**

1. **Frontend (Vercel)**
   - Next.js application
   - Edge functions for dynamic content
   - Connects to Supabase directly (client-side)
   - Calls backend API for writes

2. **Backend (Railway)**
   - NestJS application
   - Single dyno to start (scale horizontally later)
   - Environment variables for secrets
   - Connected to Supabase, Redis, Stripe

3. **Database (Supabase)**
   - Hosted PostgreSQL
   - Automatic backups
   - Connection pooling (pgBouncer)
   - Point-in-time recovery

4. **Stripe (SaaS)**
   - Payment processing
   - Webhook delivery to Railway backend
   - Subscription management

**Connection Flow:**
```
User → Vercel (Next.js) → Supabase (reads via RLS)
User → Vercel → Railway (API) → Supabase + Stripe
Stripe → Railway (webhooks) → PGMQ (Postgres queue) → Supabase
Railway → pg_cron → Process scheduled jobs → Supabase + Stripe
```

**Cost Estimate (v1):**
- Railway: $5/month (hobby plan)
- Supabase: Free tier (includes pg_cron + PGMQ)
- Stripe: Pay per transaction
- **Total: $5/month (no Redis needed)**

**Future Cost (if migrating to Redis):**
- Railway: $20/month (scaled)
- Upstash Redis: $90/month
- Supabase: $25/month (Pro)
- **Total: $135/month (only when > 10K jobs/day)**

---

## Critical Components

### 1. Webhook Handler (Idempotent, Queued via PGMQ)

**Responsibility:** Receive Stripe webhooks, verify, queue for processing

**Key Features:**
- Signature verification (Stripe secret)
- Idempotency check (Postgres table with unique constraint)
- Queue job via PGMQ immediately
- Return 200 OK (never block)

**Implementation Example:**
```typescript
@Post('webhooks/stripe')
async handleStripeWebhook(@Req() req, @Headers('stripe-signature') sig: string) {
  // 1. Verify signature
  const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)

  // 2. Check idempotency (Postgres table)
  const { data: existing } = await supabase
    .from('processed_webhooks')
    .select('id')
    .eq('event_id', event.id)
    .single()

  if (existing) return { received: true } // Already processed

  // 3. Queue in PGMQ
  await supabase.rpc('pgmq.send', {
    queue_name: 'webhook_processing',
    msg: event
  })

  // 4. Return 200 OK immediately
  return { received: true }
}
```

**Why Critical:**
- Missed webhook = wrong subscription status
- Must handle retries from Stripe
- Must prevent duplicate processing

---

### 2. Dunning Service (pg_cron + PGMQ)

**Responsibility:** Recover failed payments via email sequences

**Flow:**
- Day 0: Payment fails → Email 1
- Day 3: Email 2 + in-app banner
- Day 7: Final email + SMS
- Day 10: Pause subscription + downgrade offer

**Implementation (v1 - Postgres-native):**
```sql
-- Schedule dunning job to run daily at 9 AM
SELECT cron.schedule(
  'dunning-flow',
  '0 9 * * *',
  $$ SELECT process_dunning_flow(); $$
);

-- Process dunning flow (Postgres function)
CREATE OR REPLACE FUNCTION process_dunning_flow()
RETURNS void AS $$
BEGIN
  -- Find failed payments and queue emails
  INSERT INTO pgmq.q_email_queue (msg)
  SELECT jsonb_build_object(
    'customer_id', customer_id,
    'template', 'dunning_day_' || days_since_failure,
    'attempt', dunning_attempt
  )
  FROM subscriptions
  WHERE status = 'past_due'
  AND dunning_attempt BETWEEN 1 AND 3;
END;
$$ LANGUAGE plpgsql;
```

**Why Critical:**
- Directly impacts revenue recovery
- Must be reliable (can't miss a day)
- pg_cron provides automatic failover with Postgres

---

### 3. Usage Tracking Service

**Responsibility:** Track API usage, enforce limits, bill for overages

**Flow (v1 - Postgres-based):**
1. API call received
2. Check rate limit (Postgres query)
3. Track usage (INSERT into `api_usage` table)
4. Hourly: Aggregate via pg_cron
5. Monthly: Report to Stripe for billing

**Implementation:**
```sql
-- Check rate limit (fast query with index)
SELECT COUNT(*) FROM api_usage
WHERE user_id = $1
AND created_at > NOW() - INTERVAL '1 minute';

-- Track usage
INSERT INTO api_usage (user_id, endpoint, tokens_used)
VALUES ($1, $2, $3);

-- Hourly aggregation (via pg_cron)
SELECT cron.schedule(
  'aggregate-usage',
  '0 * * * *', -- Every hour
  $$ SELECT aggregate_hourly_usage(); $$
);
```

**When to migrate to Redis:**
- When processing > 100K API calls/day
- When rate limit queries become slow (> 50ms)
- When you need sub-second rate limiting

**Why Critical:**
- Usage data = revenue for metered billing
- Must be accurate (billing depends on it)

---

### 4. Subscription Management Service

**Responsibility:** Handle upgrade/downgrade/cancel operations

**Key Operations:**
- Upgrade: Change price, prorate, update database
- Downgrade: Schedule for next billing cycle
- Cancel: Immediate vs end of period

**Why Critical:**
- Involves money (must be atomic)
- Must sync Stripe + Supabase
- Business logic enforcement (can user downgrade?)

---

## Monitoring & Observability

**Must Have:**
1. **Error Tracking:** Sentry (catch all exceptions)
2. **Logging:** Structured logs (JSON format)
3. **Metrics:** Track key operations (webhook processing time, queue depth)
4. **Alerts:** Slack notifications for critical failures

**Key Metrics to Track:**
- Webhook processing time (should be < 100ms)
- Queue depth (should stay low)
- Failed payment rate
- Dunning recovery rate
- API error rate

---

## Security Considerations

**Secrets Management:**
- All API keys in environment variables
- Never commit secrets to git
- Rotate keys quarterly

**API Security:**
- Rate limiting (prevent abuse)
- Input validation (Zod schemas)
- RLS policies (prevent data leaks)
- Webhook signature verification

**Compliance:**
- PCI DSS: Stripe handles (never store card data)
- GDPR: User data deletion endpoint
- SOC 2: Audit logging for all changes

---

## Next Steps (Implementation Order)

### Phase 1: Core Setup (Week 1)
- Initialize NestJS project
- Connect Supabase (no Redis initially)
- Enable pg_cron extension in Supabase Dashboard
- Enable PGMQ extension in Supabase Dashboard
- Set up Stripe webhooks
- Deploy to Railway

### Phase 2: Checkout Flow (Week 2)
- Create checkout session endpoint
- Webhook handlers using PGMQ
- Database schema for subscriptions
- Idempotency table for webhooks

### Phase 3: Dunning (Week 3)
- pg_cron job for dunning flow
- PGMQ queue for email sending
- Dunning Postgres function
- Email templates

### Phase 4: Usage Tracking (Week 4)
- API middleware for usage tracking
- Postgres tables for usage events
- pg_cron hourly aggregation
- Rate limiting via Postgres queries

### Phase 5: Portal & Analytics (Week 5)
- Subscription management endpoints
- Analytics Postgres functions
- Revenue dashboard queries

### Phase 6: Monitor & Scale (Ongoing)
- Track queue depth, latency, job volume
- Migrate to Redis/BullMQ when thresholds hit
- Optimize Postgres queries with indexes

---

## Key Takeaways

1. **NestJS** for type-safe, structured backend
2. **Supabase** for all persistent data (no ORM needed)
3. **pg_cron + PGMQ** for v1 (no Redis initially - save $1,080/year)
4. **Migrate to Redis/BullMQ** only when metrics prove it's needed (> 10K jobs/day)
5. **Railway** for simple, scalable deployment
6. **Three-layer webhook reliability** (immediate → PGMQ queue → pg_cron reconciliation)
7. **Frontend reads from Supabase directly** (with RLS)
8. **Backend handles all writes** (business logic + security)
9. **No ORM** (Supabase type generation + Zod is sufficient)
10. **Start simple, add complexity only when needed** (avoid premature optimization)

## Migration Triggers

**Add Redis/BullMQ when you hit ANY of these:**
- Processing > 10,000 jobs/day
- Queue depth > 1,000 regularly
- Need sub-second rate limiting
- Job processing > 30 seconds (need worker pools)
- API calls > 100,000/day

**Until then:** Stay with pg_cron + PGMQ (simpler, cheaper, sufficient)
