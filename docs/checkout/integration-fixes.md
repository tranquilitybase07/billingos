# Payment Checkout Integration - Fix Implementation Guide

## Overview
This document provides **ready-to-implement code fixes** for all integration issues identified in the analysis. Each fix includes the exact code changes needed.

---

## 1. DATABASE TRANSACTIONS - Critical Fix

### Problem: Multi-step operations can fail partially, leaving inconsistent data

### Solution: Implement atomic operations using Supabase RPC functions

#### A. Create Subscription Atomically

**SQL Migration:**
```sql
-- Create atomic subscription creation function
CREATE OR REPLACE FUNCTION create_subscription_atomic(
  p_subscription JSONB,
  p_features JSONB[],
  p_customer_id UUID,
  p_product_id UUID,
  p_organization_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id UUID;
  v_existing_sub RECORD;
  v_result JSONB;
BEGIN
  -- Start transaction
  -- Check for existing active subscription
  SELECT * INTO v_existing_sub
  FROM subscriptions
  WHERE customer_id = p_customer_id
    AND product_id = p_product_id
    AND status IN ('active', 'trialing')
  FOR UPDATE; -- Lock the row

  IF FOUND THEN
    RAISE EXCEPTION 'Active subscription already exists'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Insert subscription
  INSERT INTO subscriptions (
    customer_id,
    product_id,
    organization_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    amount,
    currency,
    interval,
    interval_count,
    trial_start,
    trial_end,
    current_period_start,
    current_period_end,
    metadata
  )
  SELECT
    (p_subscription->>'customer_id')::UUID,
    (p_subscription->>'product_id')::UUID,
    (p_subscription->>'organization_id')::UUID,
    p_subscription->>'status',
    p_subscription->>'stripe_subscription_id',
    p_subscription->>'stripe_price_id',
    (p_subscription->>'amount')::INTEGER,
    p_subscription->>'currency',
    p_subscription->>'interval',
    (p_subscription->>'interval_count')::INTEGER,
    (p_subscription->>'trial_start')::TIMESTAMPTZ,
    (p_subscription->>'trial_end')::TIMESTAMPTZ,
    (p_subscription->>'current_period_start')::TIMESTAMPTZ,
    (p_subscription->>'current_period_end')::TIMESTAMPTZ,
    p_subscription->'metadata'
  RETURNING id INTO v_subscription_id;

  -- Grant features
  IF array_length(p_features, 1) > 0 THEN
    INSERT INTO feature_grants (
      customer_id,
      feature_id,
      subscription_id,
      granted_at,
      metadata
    )
    SELECT
      p_customer_id,
      (feature->>'feature_id')::UUID,
      v_subscription_id,
      NOW(),
      feature->'metadata'
    FROM unnest(p_features) AS feature
    ON CONFLICT (customer_id, feature_id)
    DO UPDATE SET
      subscription_id = EXCLUDED.subscription_id,
      granted_at = EXCLUDED.granted_at;
  END IF;

  -- Update customer status
  UPDATE customers
  SET
    has_active_subscription = true,
    updated_at = NOW()
  WHERE id = p_customer_id;

  -- Clear cache flags
  UPDATE products
  SET metrics_last_calculated_at = NULL
  WHERE id = p_product_id;

  -- Return result
  v_result := jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id
  );

  RETURN v_result;

EXCEPTION
  WHEN unique_violation THEN
    -- Subscription already exists
    RAISE;
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE LOG 'Subscription creation failed: %', SQLERRM;
    RAISE;
END;
$$;
```

**TypeScript Implementation:**
```typescript
// stripe-webhook.service.ts - Replace lines 1574-1712
async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  try {
    // Prepare subscription data
    const subscriptionData = {
      customer_id: customerId,
      product_id: productId,
      organization_id: organizationId,
      stripe_subscription_id: stripeSubscription.id,
      stripe_price_id: priceId,
      status: stripeSubscription.status,
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring.interval,
      interval_count: price.recurring.interval_count,
      trial_start: trialStart ? new Date(trialStart * 1000) : null,
      trial_end: trialEnd ? new Date(trialEnd * 1000) : null,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000),
      metadata: {
        payment_intent_id: paymentIntent.id,
        checkout_session_id: sessionId
      }
    };

    // Prepare feature grants
    const featureGrants = productFeatures.map(f => ({
      feature_id: f.feature_id,
      metadata: { granted_via: 'subscription' }
    }));

    // Execute atomic operation
    const { data, error } = await this.supabase.rpc('create_subscription_atomic', {
      p_subscription: subscriptionData,
      p_features: featureGrants,
      p_customer_id: customerId,
      p_product_id: productId,
      p_organization_id: organizationId
    });

    if (error) {
      // CRITICAL: Refund the payment since we can't provide service
      await this.refundPayment(paymentIntent, stripeAccountId, 'subscription_creation_failed');
      throw new Error(`Failed to create subscription: ${error.message}`);
    }

    this.logger.log(`Subscription created atomically: ${data.subscription_id}`);

  } catch (error) {
    this.logger.error('Failed to handle payment intent:', error);
    throw error;
  }
}
```

---

## 2. IDEMPOTENCY IMPLEMENTATION - Critical Fix

### Problem: Double-clicks and retries create duplicate charges/subscriptions

### Solution: Implement comprehensive idempotency with keys

#### A. Add Idempotency to Checkout Creation

**Database Migration:**
```sql
-- Add idempotency table
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  request_hash VARCHAR(64) NOT NULL,
  response JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_keys_key ON idempotency_keys(key);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

**TypeScript Implementation:**
```typescript
// checkout.service.ts - Add idempotency wrapper
import { createHash } from 'crypto';

class CheckoutService {
  async createCheckoutWithIdempotency(
    dto: CreateCheckoutDto,
    sessionToken: string,
    idempotencyKey?: string
  ): Promise<any> {
    // Generate idempotency key if not provided
    const key = idempotencyKey || this.generateIdempotencyKey(dto, sessionToken);

    // Create request hash for validation
    const requestHash = this.hashRequest(dto);

    // Check for existing idempotent request
    const { data: existing } = await this.supabase
      .from('idempotency_keys')
      .select('*')
      .eq('key', key)
      .single();

    if (existing) {
      // Validate request hasn't changed
      if (existing.request_hash !== requestHash) {
        throw new BadRequestException('Request does not match idempotency key');
      }

      // Return cached response if completed
      if (existing.status === 'completed') {
        return existing.response;
      }

      // Wait for in-progress request
      if (existing.status === 'pending') {
        return this.waitForIdempotentResponse(key);
      }
    }

    // Store idempotency key
    const { error: insertError } = await this.supabase
      .from('idempotency_keys')
      .insert({
        key,
        request_hash: requestHash,
        status: 'pending'
      });

    if (insertError && insertError.code === '23505') {
      // Duplicate key, race condition - wait for other request
      return this.waitForIdempotentResponse(key);
    }

    try {
      // Execute the actual checkout creation
      const result = await this.createCheckoutInternal(dto, sessionToken);

      // Store successful result
      await this.supabase
        .from('idempotency_keys')
        .update({
          response: result,
          status: 'completed'
        })
        .eq('key', key);

      return result;

    } catch (error) {
      // Mark as failed
      await this.supabase
        .from('idempotency_keys')
        .update({
          status: 'failed',
          response: { error: error.message }
        })
        .eq('key', key);

      throw error;
    }
  }

  private generateIdempotencyKey(dto: CreateCheckoutDto, sessionToken: string): string {
    const data = `${sessionToken}-${dto.priceId}-${dto.customerEmail}-${Date.now()}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private hashRequest(dto: CreateCheckoutDto): string {
    const normalized = JSON.stringify(dto, Object.keys(dto).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  private async waitForIdempotentResponse(key: string, maxWait = 10000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data } = await this.supabase
        .from('idempotency_keys')
        .select('*')
        .eq('key', key)
        .single();

      if (data?.status === 'completed') {
        return data.response;
      }

      if (data?.status === 'failed') {
        throw new Error(data.response?.error || 'Request failed');
      }
    }

    throw new Error('Timeout waiting for idempotent response');
  }
}
```

---

## 3. REFUND LOGIC - Critical Fix

### Problem: Payment succeeds but subscription fails, customer charged without service

### Solution: Implement automatic refunds and reconciliation

**TypeScript Implementation:**
```typescript
// stripe-webhook.service.ts - Add refund method
class StripeWebhookService {
  async refundPayment(
    paymentIntent: Stripe.PaymentIntent,
    stripeAccountId: string,
    reason: string
  ): Promise<void> {
    try {
      // Create refund in Stripe
      const refund = await this.stripeService.getClient().refunds.create(
        {
          payment_intent: paymentIntent.id,
          reason: 'requested_by_customer',
          metadata: {
            refund_reason: reason,
            automatic: 'true',
            timestamp: new Date().toISOString()
          }
        },
        {
          stripeAccount: stripeAccountId
        }
      );

      // Log refund in database
      await this.supabase.from('refunds').insert({
        payment_intent_id: paymentIntent.id,
        stripe_refund_id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        reason: reason,
        status: refund.status,
        metadata: refund.metadata
      });

      // Add to reconciliation queue for monitoring
      await this.supabase.from('reconciliation_queue').insert({
        type: 'refund',
        reference_id: paymentIntent.id,
        status: 'completed',
        details: {
          refund_id: refund.id,
          reason: reason
        }
      });

      this.logger.info(`Refund processed: ${refund.id} for ${paymentIntent.id}`);

      // Send notification email
      if (paymentIntent.receipt_email) {
        await this.emailService.sendRefundNotification(
          paymentIntent.receipt_email,
          {
            amount: refund.amount / 100,
            currency: refund.currency.toUpperCase(),
            reason: reason,
            refund_id: refund.id
          }
        );
      }

    } catch (error) {
      this.logger.error('Failed to process refund:', error);

      // Add to manual reconciliation queue
      await this.supabase.from('reconciliation_queue').insert({
        type: 'refund_failed',
        reference_id: paymentIntent.id,
        status: 'pending_manual_review',
        error: error.message,
        details: {
          payment_intent: paymentIntent.id,
          amount: paymentIntent.amount,
          customer: paymentIntent.customer,
          reason: reason
        }
      });

      // Alert operations team
      await this.alertService.sendCriticalAlert(
        'Refund Failed - Manual Intervention Required',
        `Payment ${paymentIntent.id} needs manual refund. Error: ${error.message}`
      );
    }
  }
}
```

---

## 4. TRIAL ABUSE PREVENTION - High Priority

### Problem: Customers can get unlimited trials

### Solution: Track trial history and enforce limits

**Database Migration:**
```sql
-- Create trial history table
CREATE TABLE trial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  product_id UUID NOT NULL REFERENCES products(id),
  trial_start TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, product_id) -- One trial per product per customer
);

CREATE INDEX idx_trial_history_customer ON trial_history(customer_id);
CREATE INDEX idx_trial_history_product ON trial_history(product_id);

-- Function to check trial eligibility
CREATE OR REPLACE FUNCTION check_trial_eligibility(
  p_customer_id UUID,
  p_product_id UUID,
  p_email VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_trial BOOLEAN;
  v_email_domain VARCHAR;
BEGIN
  -- Check direct trial history
  SELECT EXISTS(
    SELECT 1 FROM trial_history
    WHERE customer_id = p_customer_id
      AND product_id = p_product_id
  ) INTO v_has_trial;

  IF v_has_trial THEN
    RETURN FALSE;
  END IF;

  -- Check for trial abuse via email variations
  v_email_domain := split_part(p_email, '@', 2);

  -- Check if same email with + variations had trial
  SELECT EXISTS(
    SELECT 1 FROM customers c
    JOIN trial_history th ON th.customer_id = c.id
    WHERE c.email ILIKE split_part(p_email, '+', 1) || '%@' || v_email_domain
      AND th.product_id = p_product_id
  ) INTO v_has_trial;

  RETURN NOT v_has_trial;
END;
$$ LANGUAGE plpgsql;
```

**TypeScript Implementation:**
```typescript
// stripe-webhook.service.ts - Update subscription creation
async createSubscriptionWithTrialCheck(
  customerId: string,
  productId: string,
  priceId: string,
  stripeAccountId: string
): Promise<Stripe.Subscription> {
  // Check trial eligibility
  const { data: eligible } = await this.supabase.rpc('check_trial_eligibility', {
    p_customer_id: customerId,
    p_product_id: productId,
    p_email: customer.email
  });

  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    metadata: {
      customer_id: customerId,
      product_id: productId
    }
  };

  // Only apply trial if eligible
  if (eligible && product.trial_period_days) {
    subscriptionParams.trial_period_days = product.trial_period_days;

    // Record trial usage
    await this.supabase.from('trial_history').insert({
      customer_id: customerId,
      product_id: productId,
      trial_start: new Date(),
      trial_end: new Date(Date.now() + product.trial_period_days * 24 * 60 * 60 * 1000)
    });
  }

  return await this.stripeService.getClient().subscriptions.create(
    subscriptionParams,
    { stripeAccount: stripeAccountId }
  );
}
```

---

## 5. RACE CONDITION PREVENTION - High Priority

### Problem: Concurrent requests create duplicate subscriptions/customers

### Solution: Use database-level locking and constraints

**Database Migration:**
```sql
-- Add unique constraints
ALTER TABLE subscriptions
ADD CONSTRAINT unique_active_subscription
UNIQUE (customer_id, product_id, status)
WHERE status IN ('active', 'trialing');

ALTER TABLE customers
ADD CONSTRAINT unique_customer_per_org
UNIQUE (organization_id, email);

ALTER TABLE customers
ADD CONSTRAINT unique_external_id_per_org
UNIQUE (organization_id, external_id)
WHERE external_id IS NOT NULL;

-- Add advisory lock function for critical operations
CREATE OR REPLACE FUNCTION acquire_subscription_lock(
  p_customer_id UUID,
  p_product_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_lock_key BIGINT;
BEGIN
  -- Generate unique lock key from UUIDs
  v_lock_key := hashtext(p_customer_id::TEXT || p_product_id::TEXT)::BIGINT;

  -- Try to acquire advisory lock (non-blocking)
  RETURN pg_try_advisory_lock(v_lock_key);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_subscription_lock(
  p_customer_id UUID,
  p_product_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_lock_key BIGINT;
BEGIN
  v_lock_key := hashtext(p_customer_id::TEXT || p_product_id::TEXT)::BIGINT;
  RETURN pg_advisory_unlock(v_lock_key);
END;
$$ LANGUAGE plpgsql;
```

**TypeScript Implementation:**
```typescript
// checkout.service.ts - Use locking for subscription creation
async createSubscriptionWithLocking(
  customerId: string,
  productId: string,
  subscriptionData: any
): Promise<any> {
  // Acquire lock
  const { data: lockAcquired } = await this.supabase.rpc('acquire_subscription_lock', {
    p_customer_id: customerId,
    p_product_id: productId
  });

  if (!lockAcquired) {
    // Another process is creating subscription, wait and check
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if subscription was created
    const existing = await this.findActiveSubscription(customerId, productId);
    if (existing) {
      return existing;
    }

    // Retry with exponential backoff
    throw new ConflictException('Subscription creation in progress, please retry');
  }

  try {
    // Double-check for existing subscription while holding lock
    const existing = await this.findActiveSubscription(customerId, productId);
    if (existing) {
      return existing;
    }

    // Create subscription
    const subscription = await this.createSubscriptionAtomic(subscriptionData);

    return subscription;

  } finally {
    // Always release lock
    await this.supabase.rpc('release_subscription_lock', {
      p_customer_id: customerId,
      p_product_id: productId
    });
  }
}
```

---

## 6. WEBHOOK ORDERING - Medium Priority

### Problem: Out-of-order webhooks cause incorrect state

### Solution: Track sequence numbers and process in order

**Database Migration:**
```sql
-- Add sequence tracking to webhooks
ALTER TABLE webhook_events
ADD COLUMN sequence_number BIGINT,
ADD COLUMN processed_at TIMESTAMPTZ,
ADD COLUMN depends_on VARCHAR(255);

CREATE INDEX idx_webhook_sequence ON webhook_events(sequence_number);

-- Function to process webhooks in order
CREATE OR REPLACE FUNCTION process_webhook_ordered(
  p_event_id VARCHAR,
  p_event_type VARCHAR,
  p_sequence BIGINT
) RETURNS JSONB AS $$
DECLARE
  v_prev_sequence BIGINT;
  v_result JSONB;
BEGIN
  -- Check if previous webhooks are processed
  SELECT MAX(sequence_number) INTO v_prev_sequence
  FROM webhook_events
  WHERE processed_at IS NOT NULL
    AND sequence_number < p_sequence;

  -- If there's a gap, defer processing
  IF v_prev_sequence IS NOT NULL AND v_prev_sequence < p_sequence - 1 THEN
    UPDATE webhook_events
    SET status = 'deferred',
        metadata = jsonb_build_object(
          'reason', 'waiting_for_sequence',
          'waiting_for', v_prev_sequence + 1
        )
    WHERE event_id = p_event_id;

    RETURN jsonb_build_object('status', 'deferred');
  END IF;

  -- Process webhook
  -- ... webhook processing logic ...

  -- Mark as processed
  UPDATE webhook_events
  SET processed_at = NOW(),
      status = 'completed'
  WHERE event_id = p_event_id;

  -- Check for deferred webhooks that can now be processed
  PERFORM pg_notify('webhook_ready',
    (SELECT event_id FROM webhook_events
     WHERE status = 'deferred'
       AND sequence_number = p_sequence + 1
     LIMIT 1)::TEXT
  );

  RETURN jsonb_build_object('status', 'completed');
END;
$$ LANGUAGE plpgsql;
```

---

## 7. PROPER DATE CALCULATIONS - Low Priority

### Problem: Naive date math causes billing issues

### Solution: Use proper date libraries and handle edge cases

**TypeScript Implementation:**
```typescript
// utils/date-calculations.ts
import { addMonths, addYears, endOfMonth, startOfMonth } from 'date-fns';

export class BillingDateCalculator {
  static calculateNextBillingDate(
    startDate: Date,
    interval: 'month' | 'year',
    intervalCount: number = 1
  ): Date {
    if (interval === 'month') {
      // Handle month-end edge cases
      const dayOfMonth = startDate.getDate();
      let nextDate = addMonths(startDate, intervalCount);

      // If original date was end of month, keep it at end of month
      if (dayOfMonth > 28) {
        const endOfOriginalMonth = endOfMonth(startDate);
        if (startDate.getDate() === endOfOriginalMonth.getDate()) {
          nextDate = endOfMonth(nextDate);
        }
      }

      return nextDate;
    } else {
      return addYears(startDate, intervalCount);
    }
  }

  static calculateProratedAmount(
    fullAmount: number,
    startDate: Date,
    endDate: Date,
    billingInterval: 'month' | 'year'
  ): number {
    if (billingInterval === 'month') {
      const daysInMonth = endOfMonth(startDate).getDate();
      const daysRemaining = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return Math.round((fullAmount * daysRemaining) / daysInMonth);
    } else {
      const daysInYear = 365; // Or 366 for leap years
      const daysRemaining = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return Math.round((fullAmount * daysRemaining) / daysInYear);
    }
  }
}
```

---

## 8. MONITORING & ALERTING - Medium Priority

### Solution: Add comprehensive monitoring

**TypeScript Implementation:**
```typescript
// monitoring/checkout-metrics.ts
export class CheckoutMetrics {
  private metrics = {
    checkoutCreated: new Counter({
      name: 'checkout_created_total',
      help: 'Total checkouts created',
      labelNames: ['product', 'status']
    }),

    paymentProcessed: new Counter({
      name: 'payment_processed_total',
      help: 'Total payments processed',
      labelNames: ['status', 'payment_method']
    }),

    subscriptionCreated: new Counter({
      name: 'subscription_created_total',
      help: 'Total subscriptions created',
      labelNames: ['product', 'trial']
    }),

    checkoutDuration: new Histogram({
      name: 'checkout_duration_seconds',
      help: 'Checkout completion time',
      buckets: [1, 5, 10, 30, 60, 120]
    }),

    concurrentCheckouts: new Gauge({
      name: 'concurrent_checkouts',
      help: 'Number of concurrent checkout sessions'
    }),

    duplicateAttempts: new Counter({
      name: 'duplicate_checkout_attempts_total',
      help: 'Duplicate checkout attempts blocked'
    })
  };

  recordCheckoutCreated(product: string, status: string) {
    this.metrics.checkoutCreated.inc({ product, status });
  }

  recordPayment(status: string, paymentMethod: string) {
    this.metrics.paymentProcessed.inc({ status, payment_method: paymentMethod });

    // Alert on high failure rate
    if (status === 'failed') {
      this.checkFailureRate();
    }
  }

  private async checkFailureRate() {
    const failureRate = await this.calculateFailureRate();
    if (failureRate > 0.1) { // >10% failure rate
      await this.alertService.sendAlert('High Payment Failure Rate', {
        rate: failureRate,
        threshold: 0.1
      });
    }
  }
}
```

---

## 9. TESTING SUITE

### Integration Tests for Fixed Flows

```typescript
// __tests__/checkout-integration.spec.ts
describe('Checkout Integration with Fixes', () => {
  describe('Idempotency', () => {
    it('should handle double-click on subscribe button', async () => {
      const dto = { priceId: 'price_123', customerEmail: 'test@example.com' };

      // Simulate double-click
      const [result1, result2] = await Promise.all([
        checkoutService.createCheckout(dto, 'session_1'),
        checkoutService.createCheckout(dto, 'session_1')
      ]);

      expect(result1.id).toBe(result2.id); // Same checkout returned
      expect(await countCheckoutSessions()).toBe(1); // Only one created
    });

    it('should reject different request with same idempotency key', async () => {
      const key = 'test-key-123';
      await checkoutService.createCheckout(
        { priceId: 'price_1' },
        'session_1',
        key
      );

      await expect(
        checkoutService.createCheckout(
          { priceId: 'price_2' }, // Different request
          'session_1',
          key
        )
      ).rejects.toThrow('Request does not match idempotency key');
    });
  });

  describe('Transaction Atomicity', () => {
    it('should rollback all changes if feature grant fails', async () => {
      // Mock feature grant to fail
      jest.spyOn(featureService, 'grantFeatures').mockRejectedValue(new Error());

      await expect(
        webhookService.handlePaymentIntentSucceeded(mockPaymentIntent)
      ).rejects.toThrow();

      // Verify no subscription created
      const subscription = await findSubscription(customerId, productId);
      expect(subscription).toBeNull();

      // Verify refund was issued
      const refund = await findRefund(paymentIntentId);
      expect(refund).toBeDefined();
    });
  });

  describe('Trial Abuse Prevention', () => {
    it('should not grant second trial for same product', async () => {
      // First subscription with trial
      await createSubscriptionWithTrial(customerId, productId);

      // Cancel subscription
      await cancelSubscription(customerId, productId);

      // Try to get trial again
      const secondSub = await createSubscription(customerId, productId);
      expect(secondSub.trial_end).toBeNull(); // No trial granted
    });

    it('should detect email variations for trial abuse', async () => {
      // Create trial with base email
      await createSubscriptionWithTrial('user@example.com', productId);

      // Try with + variation
      const eligible = await checkTrialEligibility('user+test@example.com', productId);
      expect(eligible).toBe(false);
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent subscription creation', async () => {
      // Create 10 concurrent subscription attempts
      const attempts = Array(10).fill(null).map(() =>
        createSubscription(customerId, productId)
      );

      const results = await Promise.allSettled(attempts);

      // Only one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful).toHaveLength(1);

      // Others should fail with specific error
      const failed = results.filter(r => r.status === 'rejected');
      failed.forEach(result => {
        expect(result.reason.message).toContain('already exists');
      });
    });
  });
});
```

---

## Implementation Priority & Timeline

### Week 1 - Critical Fixes (Production Blockers)
1. **Day 1-2**: Implement database transactions
2. **Day 2-3**: Add idempotency infrastructure
3. **Day 3-4**: Implement refund logic
4. **Day 4-5**: Test critical fixes thoroughly

### Week 2 - High Priority Fixes
1. **Day 1-2**: Add unique constraints and locking
2. **Day 2-3**: Implement trial abuse prevention
3. **Day 3-4**: Fix race conditions
4. **Day 4-5**: Integration testing

### Week 3 - Medium Priority
1. **Day 1-2**: Webhook ordering
2. **Day 2-3**: Monitoring implementation
3. **Day 3-5**: Full system testing

### Verification Checklist

After implementing each fix:
- [ ] Unit tests written and passing
- [ ] Integration tests covering edge cases
- [ ] Load testing for concurrency
- [ ] Manual testing in staging
- [ ] Monitoring metrics configured
- [ ] Rollback plan documented

---

## Notes

- All SQL migrations should be tested in a staging environment first
- Consider using feature flags for gradual rollout
- Monitor error rates closely after deployment
- Have manual reconciliation processes ready as backup
- Document all changes for support team