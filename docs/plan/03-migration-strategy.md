# BillingOS Migration Strategy: Hybrid → Full DB Ownership

**Date:** January 3, 2026
**Trigger:** 100+ paying merchants (product-market fit validated)
**Timeline:** 6-12 months gradual migration
**Goal:** Own subscription billing, use Stripe only for payments

---

## Why Migrate?

### Current State (Hybrid Architecture)
- ✅ Fast reads (2-5ms from cache)
- ✅ Stripe handles subscription complexity
- ✅ Lower development time (3 weeks to MVP)
- ⚠️ Dependent on Stripe Subscriptions API
- ⚠️ Limited customization for billing logic
- ⚠️ Stripe API rate limits (100 req/sec per account)

### Future State (Full DB Ownership)
- ✅ Complete control over billing logic
- ✅ No Stripe API rate limits for subscriptions
- ✅ Custom billing features (complex dunning, flexible pricing)
- ✅ Multi-payment processor support (add PayPal, etc.)
- ⚠️ More code to maintain
- ⚠️ Higher complexity

---

## Migration Trigger Points

### Trigger 1: Business Validation (100+ Merchants)
**When:** 100+ paying merchants
**Why:** Product-market fit validated, worth investing in infrastructure

### Trigger 2: Technical Necessity (Rate Limits)
**When:** Hitting Stripe API rate limits
**Calculation:**
- 500 merchants × 100 API calls/day = 50,000 calls/day
- Stripe limit: ~8.6 million calls/day (100 req/sec)
- Safe margin: Migrate before hitting 50% of limit (250+ merchants)

### Trigger 3: Feature Limitations
**When:** Stripe doesn't support a critical feature you need
**Examples:**
- Custom proration logic
- Complex trial extensions
- Multi-currency with custom exchange rates
- Usage-based billing with complex tiers

**Decision:** Migrate when ANY trigger is met (likely Trigger 1 first)

---

## Migration Phases

### Phase 1: Preparation (2-3 months)
**Goal:** Build dual-mode support without breaking existing system

#### 1.1 Database Schema Enhancement
Add columns to support both modes:

```sql
-- Add to subscriptions table
ALTER TABLE subscriptions ADD COLUMN source VARCHAR(20) DEFAULT 'stripe';
-- Values: 'stripe' (legacy) or 'billingos' (new)

ALTER TABLE subscriptions ADD COLUMN billing_anchor_day INTEGER;
-- For BillingOS-managed subscriptions

ALTER TABLE subscriptions ADD COLUMN next_billing_date TIMESTAMPTZ;
-- When to charge next (BillingOS calculates)
```

#### 1.2 Billing Engine Development
Create new service: `apps/api/src/billing/`

**Responsibilities:**
- Calculate subscription charges (instead of Stripe)
- Determine billing dates
- Create PaymentIntents for charging
- Handle proration logic
- Manage trial periods

**Code Structure (Illustrative):**
```typescript
// apps/api/src/billing/billing-engine.service.ts
@Injectable()
export class BillingEngineService {
  async createCharge(subscription: Subscription) {
    // 1. Calculate amount (proration, discounts, etc.)
    const amount = this.calculateAmount(subscription);

    // 2. Create PaymentIntent in Stripe (NOT subscription)
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: subscription.currency,
      customer: subscription.customer.stripe_customer_id,
      metadata: { subscription_id: subscription.id }
    });

    // 3. Store charge in our DB
    await this.db.charges.create({
      subscription_id: subscription.id,
      amount,
      stripe_payment_intent_id: paymentIntent.id,
      status: 'pending'
    });
  }

  async calculateNextBillingDate(subscription: Subscription): Date {
    // Custom logic for billing dates
    // Can be different from Stripe's logic!
  }
}
```

#### 1.3 Billing Scheduler (Cron Jobs)
Create daily cron to charge subscriptions:

```typescript
@Cron('0 2 * * *') // 2 AM daily
async chargeDueSubscriptions() {
  // Find subscriptions due for billing
  const due = await this.db.subscriptions.findMany({
    where: {
      source: 'billingos', // Only BillingOS-managed
      next_billing_date: { lte: new Date() },
      status: 'active'
    }
  });

  for (const sub of due) {
    await this.billingEngine.createCharge(sub);
  }
}
```

#### 1.4 Testing Infrastructure
- Create test suite for billing engine
- Simulate various scenarios:
  - Monthly/annual subscriptions
  - Proration on upgrades/downgrades
  - Trial expirations
  - Failed payments
- Compare output vs Stripe's calculations

**Deliverables:**
- ✅ Dual-mode database schema
- ✅ Billing engine service (feature-complete)
- ✅ Comprehensive test suite
- ✅ Migration scripts ready

---

### Phase 2: Pilot (1-2 months)
**Goal:** Test with new merchants only (low risk)

#### 2.1 Feature Flag System
Add feature flag to control which system to use:

```typescript
// Create new subscription
async create(dto: CreateSubscriptionDto) {
  const merchant = await this.getMerchant(dto.merchant_id);

  if (merchant.billing_mode === 'billingos') {
    // New path: BillingOS-managed subscription
    return this.createBillingOSSubscription(dto);
  } else {
    // Legacy path: Stripe-managed subscription
    return this.createStripeSubscription(dto);
  }
}
```

#### 2.2 Onboard New Merchants to BillingOS Mode
- All NEW merchants (after migration starts) use BillingOS mode
- Existing merchants stay on Stripe mode
- Monitor for issues

#### 2.3 Monitoring & Alerts
Track metrics:
- Charge success rate (BillingOS vs Stripe)
- Billing date accuracy
- Payment failures
- Reconciliation discrepancies

**Alert if:**
- BillingOS charge success rate <98%
- Billing dates off by >1 day
- Reconciliation errors >1%

**Rollback Plan:**
If issues arise, switch new merchants back to Stripe mode

**Deliverables:**
- ✅ 10+ new merchants on BillingOS mode
- ✅ Success rate ≥99%
- ✅ No critical bugs
- ✅ Team comfortable with new system

---

### Phase 3: Gradual Migration (3-6 months)
**Goal:** Migrate existing merchants in batches

#### 3.1 Migration Batches
**Strategy:** Migrate 10% of merchants per week

**Week 1:** 10 smallest merchants (lowest risk)
**Week 2:** 20 more merchants
**Week 3:** 50 more merchants
...continue until all migrated

#### 3.2 Per-Merchant Migration Process

**For Each Merchant:**

**Step 1: Data Snapshot**
```typescript
// Take snapshot of current Stripe subscriptions
const stripeSubscriptions = await stripe.subscriptions.list({
  limit: 100
}, {
  stripeAccount: merchant.stripe_account_id
});

// Store snapshot for rollback
await this.db.migration_snapshots.create({
  merchant_id: merchant.id,
  data: stripeSubscriptions,
  created_at: new Date()
});
```

**Step 2: Migrate Subscriptions**
```typescript
for (const stripeSub of stripeSubscriptions.data) {
  // Update our DB to mark as BillingOS-managed
  await this.db.subscriptions.update({
    where: { stripe_subscription_id: stripeSub.id },
    data: {
      source: 'billingos',
      next_billing_date: new Date(stripeSub.current_period_end * 1000),
      billing_anchor_day: new Date(stripeSub.current_period_end * 1000).getDate()
    }
  });

  // Cancel Stripe subscription (don't charge anymore)
  await stripe.subscriptions.cancel(stripeSub.id, {
    prorate: false, // Don't create final invoice
    invoice_now: false
  }, {
    stripeAccount: merchant.stripe_account_id
  });
}
```

**Step 3: Verify**
- Check all subscriptions migrated
- Verify next billing dates correct
- Test creating new subscription for this merchant

**Step 4: Monitor**
- Watch for 1 billing cycle (30 days)
- Ensure charges happen correctly
- Compare revenue vs previous month

**Rollback if Needed:**
```typescript
// Re-enable Stripe subscriptions
// Revert database changes
merchant.billing_mode = 'stripe';
```

#### 3.3 Communication Plan
Email each merchant before migration:
- "We're upgrading your billing infrastructure"
- "No action needed from you"
- "If you notice any issues, contact support immediately"

**Deliverables:**
- ✅ All merchants migrated
- ✅ No revenue loss
- ✅ <5 support tickets related to migration
- ✅ BillingOS mode is default

---

### Phase 4: Cleanup (1 month)
**Goal:** Remove Stripe Subscriptions API code

#### 4.1 Code Removal
Delete legacy code:
- Remove `createStripeSubscription()` function
- Remove Stripe subscription event handlers (webhooks)
- Remove feature flags
- Simplify codebase

#### 4.2 Database Cleanup
```sql
-- Remove stripe_subscription_id column (like Polar did!)
ALTER TABLE subscriptions DROP COLUMN stripe_subscription_id;

-- Remove source column (no longer needed)
ALTER TABLE subscriptions DROP COLUMN source;
```

#### 4.3 Documentation Updates
- Update architecture docs (remove hybrid mode)
- Update API docs (reflect new billing)
- Update SDK docs

**Deliverables:**
- ✅ Codebase simplified
- ✅ No Stripe Subscriptions API calls
- ✅ Documentation updated
- ✅ Team trained on new system

---

## What We Keep From Stripe

**Even after migration, we still use Stripe for:**

1. **Customers** (`stripe.customers.*`)
   - Create customers
   - Store payment methods
   - Required for PaymentIntents

2. **PaymentIntents** (`stripe.paymentIntents.*`)
   - Charge payment methods
   - Handle 3D Secure
   - Process refunds

3. **Payment Methods** (`stripe.paymentMethods.*`)
   - Store cards
   - Update payment methods
   - Set default payment method

4. **Invoices** (Optional, for tax)
   - Generate invoices for tax calculation
   - Stripe Tax integration

5. **Connect Accounts** (`stripe.accounts.*`)
   - Already using this
   - Continue for multi-tenant isolation

**What We Stop Using:**
- ❌ `stripe.subscriptions.*` (we manage subscriptions)
- ❌ `stripe.subscriptionItems.*`
- ❌ `stripe.invoiceItems.*` (unless using for tax)
- ❌ Subscription-related webhooks

---

## Risk Mitigation

### Risk 1: Billing Date Errors
**Mitigation:**
- Extensive testing before migration
- Compare BillingOS dates vs Stripe dates (must match!)
- Dry-run migration (test without actually migrating)

### Risk 2: Payment Failures Increase
**Mitigation:**
- Monitor charge success rate closely
- Retry logic must match Stripe's
- Alert on any degradation

### Risk 3: Revenue Loss
**Mitigation:**
- Daily revenue reconciliation (compare to previous month)
- Immediately rollback merchant if revenue drops
- Have support team ready for questions

### Risk 4: Complexity Overwhelms Team
**Mitigation:**
- Gradual migration (10%/week)
- Comprehensive documentation
- On-call rotation for billing issues
- Hire additional backend dev if needed

---

## Comparison: Before vs After Migration

| Aspect | Hybrid Mode (Before) | Full DB Ownership (After) |
|--------|----------------------|---------------------------|
| **Subscription Creation** | Stripe API call | PostgreSQL insert |
| **Billing Date Calculation** | Stripe calculates | We calculate |
| **Charging Customer** | Stripe auto-charges | We create PaymentIntent |
| **Failed Payment Retry** | Stripe handles | We handle (BullMQ job) |
| **Proration** | Stripe calculates | We calculate |
| **API Rate Limits** | 100 req/sec (Stripe) | No limit (our DB) |
| **Webhook Dependencies** | High (critical path) | Low (optional) |
| **Customization** | Limited by Stripe | Full control |
| **Complexity** | Low | High |
| **Maintenance** | Low | High |

---

## Success Metrics

### Technical Metrics
- ✅ Charge success rate ≥99%
- ✅ Billing date accuracy 100%
- ✅ Zero revenue loss
- ✅ API response time <50ms (subscriptions)
- ✅ Code coverage >80% (billing engine)

### Business Metrics
- ✅ Support tickets <5/month (migration-related)
- ✅ Merchant satisfaction maintained
- ✅ Development velocity maintained (feature releases)

---

## Timeline Summary

| Phase | Duration | Key Milestone |
|-------|----------|---------------|
| **Phase 1: Preparation** | 2-3 months | Billing engine ready |
| **Phase 2: Pilot** | 1-2 months | 10+ new merchants on BillingOS mode |
| **Phase 3: Gradual Migration** | 3-6 months | All 100+ merchants migrated |
| **Phase 4: Cleanup** | 1 month | Stripe Subscriptions API code removed |
| **Total** | **7-12 months** | Full DB ownership achieved |

---

## Decision Tree: Should We Migrate Now?

```
Start
  ↓
Do we have 100+ paying merchants?
  ├─ No → Stay in hybrid mode, focus on growth
  └─ Yes →
      ↓
      Are we hitting Stripe API rate limits?
      ├─ No → Is there a feature Stripe doesn't support that we need?
      │        ├─ No → Stay in hybrid mode (optional to migrate)
      │        └─ Yes → Plan migration (Phase 1)
      └─ Yes → Plan migration ASAP (Phase 1)
```

---

## Learning from Polar

### What Polar Did (December 2025)
- Removed `stripe_subscription_id` from database
- Removed `stripe_product_id` from database
- Removed `stripe_price_id` from database
- Kept only `stripe_customer_id` (for payments)

**Key Insight:** Polar migrated AFTER they had traction. They built with Stripe initially, then migrated when it made sense.

### What We're Doing Differently
- **Start with hybrid** (Polar may have too)
- **Gradual migration** (less risky than big bang)
- **Keep Connect accounts** (multi-tenant isolation)
- **Document the journey** (help future companies)

---

## Alternative: Never Migrate

### It's Valid to Stay Hybrid Forever

**Reasons to Never Migrate:**
- Stripe keeps improving their API
- Focus on features, not infrastructure
- Team stays small (4 devs)
- Never hit rate limits (<250 merchants)

**Companies That Stay on Stripe:**
- Baremetrics (analytics on top of Stripe)
- ChartMogul (analytics on top of Stripe)
- ProfitWell (analytics on top of Stripe)

**Our Decision:** Migrate only if business demands it.

---

## Conclusion

**The hybrid architecture is not a compromise—it's a smart starting point.**

Migrate to full DB ownership when:
1. ✅ BillingOS has 100+ merchants (validated business)
2. ✅ Need features Stripe doesn't support
3. ✅ Hitting Stripe's API rate limits

Until then, focus on:
- 🎯 Acquiring customers
- 🤖 Building AI features
- 📊 Improving analytics
- 💰 Growing revenue

**The migration path is clear, but the timing is strategic.**

---

**Read Next:**
- `04-next-steps.md` - Start building today!
- `docs/architecture/data-architecture-strategy.md` - Original Polar research
