# Stripe Webhooks - Future Enhancements

## Overview

The current webhook implementation is **production-ready** for Stripe Connect account onboarding. This document outlines optional enhancements to add later as your platform grows.

---

## Phase 4: Architectural Improvements (Future)

### 4.1 Separate Connect Webhook Endpoint

**Status:** ⚪ Deferred (not needed yet)

**When to Implement:**
- When you start processing **direct payments** (non-Connect events)
- When you have both Connect and non-Connect Stripe events
- When you need different monitoring/alerting for Connect events

**What to Create:**

#### New Endpoint: `/stripe/webhooks-connect`

**Controller:** `apps/api/src/stripe/stripe.controller.ts`
```typescript
@Post('webhooks-connect')
async handleConnectWebhook(@Req() req: RawBodyRequest<Request>) {
  const signature = req.headers['stripe-signature'] as string;
  const event = this.stripeService.constructConnectWebhookEvent(
    req.rawBody,
    signature,
  );
  await this.webhookService.handleEvent(event);
  return { received: true };
}
```

**Service Method:** `apps/api/src/stripe/stripe.service.ts`
```typescript
constructConnectWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const webhookSecret = this.configService.get<string>(
    'STRIPE_CONNECT_WEBHOOK_SECRET', // Separate secret
  );

  if (!webhookSecret) {
    throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not defined');
  }

  return this.stripe.webhooks.constructEvent(
    payload,
    signature,
    webhookSecret,
  );
}
```

**Environment Variable:**
```bash
# .env
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_your_connect_secret_here
```

**Stripe Dashboard Setup:**
- Create **two** webhook endpoints:
  - `/stripe/webhooks` - For direct payments (customer.*, invoice.*, etc.)
  - `/stripe/webhooks-connect` - For Connect events (account.*, payout.*, etc.)
- Use different signing secrets for each

**Benefits:**
- ✅ Separate concerns (Connect vs direct payments)
- ✅ Independent monitoring and alerting
- ✅ Better security (different secrets)
- ✅ Matches Polar's architecture

**Current Status:**
- Not needed yet (all events are Connect-related)
- Easy to add later without breaking changes
- Keep using single `/stripe/webhooks` endpoint for now

---

### 4.2 Create Additional Database Tables

**Status:** ⚪ Add when you start processing payments

#### Payouts Table

**When to Create:**
- When you start processing payments through Connect accounts
- When you need to reconcile payouts with transactions
- When you need to track payout failures

**Schema:**
```sql
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe payout details
  stripe_payout_id VARCHAR(100) UNIQUE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id),

  -- Payout information
  amount BIGINT NOT NULL,               -- Amount in cents
  currency VARCHAR(3) NOT NULL,         -- ISO currency code
  status VARCHAR(50) NOT NULL,          -- paid, pending, in_transit, canceled, failed
  arrival_date DATE,                    -- Expected/actual arrival date

  -- Bank account
  destination_type VARCHAR(50),         -- bank_account, card
  destination_id VARCHAR(100),          -- Stripe bank account/card ID

  -- Failure tracking
  failure_code VARCHAR(100),
  failure_message TEXT,

  -- Metadata
  description TEXT,
  statement_descriptor VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT check_payout_status CHECK (
    status IN ('paid', 'pending', 'in_transit', 'canceled', 'failed')
  )
);

-- Indexes
CREATE UNIQUE INDEX idx_payouts_stripe_id ON public.payouts (stripe_payout_id);
CREATE INDEX idx_payouts_account_id ON public.payouts (account_id);
CREATE INDEX idx_payouts_status ON public.payouts (status);
CREATE INDEX idx_payouts_arrival_date ON public.payouts (arrival_date);
```

**Usage:**
```typescript
// In handlePayoutPaid()
await supabase.from('payouts').upsert({
  stripe_payout_id: payout.id,
  account_id: accountId,
  amount: payout.amount,
  currency: payout.currency,
  status: payout.status,
  arrival_date: new Date(payout.arrival_date * 1000).toISOString(),
  // ... other fields
});
```

---

#### Payments/Transactions Table

**When to Create:**
- When you start accepting payments from customers
- When you need transaction history
- When you need to track payment failures and retries

**Schema:**
```sql
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe payment details
  stripe_payment_intent_id VARCHAR(100) UNIQUE NOT NULL,
  stripe_charge_id VARCHAR(100),
  account_id UUID NOT NULL REFERENCES public.accounts(id),

  -- Payment information
  amount BIGINT NOT NULL,               -- Amount in cents
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL,          -- succeeded, pending, failed, canceled

  -- Customer information
  customer_id UUID REFERENCES public.users(id),  -- If you track customers
  customer_email VARCHAR(320),

  -- Failure tracking
  failure_code VARCHAR(100),
  failure_message TEXT,

  -- Platform fees (if using application fees)
  application_fee_amount BIGINT,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT check_payment_status CHECK (
    status IN ('succeeded', 'pending', 'failed', 'canceled')
  )
);

-- Indexes
CREATE UNIQUE INDEX idx_payments_stripe_id ON public.payments (stripe_payment_intent_id);
CREATE INDEX idx_payments_account_id ON public.payments (account_id);
CREATE INDEX idx_payments_customer_id ON public.payments (customer_id);
CREATE INDEX idx_payments_status ON public.payments (status);
CREATE INDEX idx_payments_created_at ON public.payments (created_at DESC);
```

---

#### Persons Table (For Company Accounts)

**When to Create:**
- When organizations use company accounts (not individual)
- When you need to track representatives/owners
- When compliance requires tracking beneficial owners

**Schema:**
```sql
CREATE TABLE public.persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe person details
  stripe_person_id VARCHAR(100) UNIQUE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id),

  -- Person information
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(320),

  -- Relationship to account
  relationship JSONB DEFAULT '{}'::jsonb,  -- {owner: true, executive: true, etc.}

  -- Verification status
  verification_status VARCHAR(50),
  verification_document JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_persons_stripe_id ON public.persons (stripe_person_id);
CREATE INDEX idx_persons_account_id ON public.persons (account_id);
```

---

### 4.3 Implement Webhook Retry Mechanism

**Status:** ⚪ Optional (Stripe already retries)

**When to Implement:**
- When you need custom retry logic beyond Stripe's default
- When you want to reprocess failed webhooks on demand
- When you need more control over retry delays

**Implementation:**

#### Background Job (Using Bull/BullMQ)

```typescript
// webhook-retry.processor.ts
@Processor('webhook-retry')
export class WebhookRetryProcessor {
  @Process()
  async retryFailedWebhook(job: Job) {
    const { eventId } = job.data;

    // Fetch failed event from database
    const { data: webhookEvent } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (!webhookEvent || webhookEvent.status === 'processed') {
      return; // Already processed
    }

    // Retry processing
    try {
      await this.webhookService.handleEvent(webhookEvent.payload);

      // Mark as processed
      await supabase
        .from('webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('event_id', eventId);
    } catch (error) {
      // Increment retry count
      await supabase
        .from('webhook_events')
        .update({
          retry_count: webhookEvent.retry_count + 1,
          error_message: error.message,
        })
        .eq('event_id', eventId);

      throw error; // Let Bull handle retry with backoff
    }
  }
}
```

**Cron Job to Retry Failed Webhooks:**
```typescript
// Every hour, retry failed webhooks
@Cron('0 * * * *')
async retryFailedWebhooks() {
  const { data: failedEvents } = await supabase
    .from('webhook_events')
    .select('event_id')
    .eq('status', 'failed')
    .lt('retry_count', 3)  // Max 3 retries
    .order('created_at', { ascending: true })
    .limit(100);

  for (const event of failedEvents) {
    await this.webhookRetryQueue.add('retry', { eventId: event.event_id });
  }
}
```

---

### 4.4 Webhook Monitoring Dashboard

**Status:** ⚪ Add when you have production traffic

**What to Build:**

#### Admin Dashboard Page: `/admin/webhooks`

**Features:**
- Recent webhook events (last 100)
- Failed webhooks with error messages
- Retry button for failed webhooks
- Event type breakdown (pie chart)
- Success rate over time (line chart)
- Processing time metrics

**Example Query:**
```typescript
// Get webhook stats
const stats = await supabase.rpc('get_webhook_stats', {
  start_date: '2026-01-01',
  end_date: '2026-01-31'
});

// Returns:
// {
//   total_events: 1234,
//   successful: 1200,
//   failed: 34,
//   success_rate: 97.2,
//   avg_processing_time_ms: 245
// }
```

---

### 4.5 Alerting & Notifications

**Status:** ⚪ Add when critical for operations

**When to Implement:**
- When webhook failures impact customer experience
- When you need 24/7 monitoring
- When you have on-call engineers

**What to Monitor:**
- High failure rate (>5% in 1 hour)
- Critical event failures (account.updated, payout.failed)
- Webhook endpoint downtime
- Slow processing times (>5s avg)

**Tools:**
- Sentry for error tracking
- Datadog/New Relic for metrics
- PagerDuty for on-call alerts
- Slack webhooks for team notifications

**Example Alert:**
```typescript
// Alert on high failure rate
if (failureRate > 0.05) {
  await sendSlackAlert({
    channel: '#stripe-alerts',
    message: `⚠️ High webhook failure rate: ${failureRate * 100}% in last hour`,
    severity: 'warning',
  });
}
```

---

## Summary

### ✅ Currently Implemented (Production Ready)
- Single webhook endpoint `/stripe/webhooks`
- Webhook events table for idempotency
- All critical Connect events handled
- Error handling and logging
- Audit trail

### ⚪ Deferred (Add When Needed)
1. **Separate Connect endpoint** - When you add direct payments
2. **Payouts table** - When you start processing payments
3. **Payments table** - When you track transactions
4. **Persons table** - When handling company accounts
5. **Retry mechanism** - When you need custom retry logic
6. **Monitoring dashboard** - When you have production traffic
7. **Alerting** - When failures are critical

### 📋 Decision Matrix

| Enhancement | Add When... | Priority |
|------------|-------------|----------|
| Separate endpoint | Processing direct payments | Medium |
| Payouts table | First payout processed | High |
| Payments table | First payment received | High |
| Persons table | Company accounts onboarded | Low |
| Retry mechanism | Frequent webhook failures | Low |
| Monitoring | Production traffic starts | Medium |
| Alerting | Failures impact customers | High |

**Current recommendation: Keep it simple until you need these features!**

Your webhook implementation is solid and production-ready for Stripe Connect onboarding. Add these enhancements incrementally as your platform grows.
