# Subscription Upgrade/Downgrade Examples

This document provides concrete examples of upgrade/downgrade scenarios with detailed calculations and API interactions.

## Table of Contents
1. [Upgrade Scenarios](#upgrade-scenarios)
2. [Downgrade Scenarios](#downgrade-scenarios)
3. [API Request/Response Examples](#api-requestresponse-examples)
4. [Proration Calculations](#proration-calculations)
5. [Edge Case Examples](#edge-case-examples)
6. [UI Flow Examples](#ui-flow-examples)

---

## Upgrade Scenarios

### Scenario 1: Free Plan → Basic Paid Plan

**Context:**
- Customer: Bob's Startup
- Current: Free Plan ($0/month)
- Upgrade to: Basic Plan ($29/month)
- Date: March 15th

**Flow:**
```
1. Customer clicks "Upgrade to Basic"
2. System checks trial eligibility
3. Free subscription canceled
4. New subscription created with 14-day trial
5. First charge scheduled for March 29th
```

**Database Changes:**
```sql
-- Cancel free subscription
UPDATE subscriptions
SET status = 'canceled',
    canceled_at = '2024-03-15 10:00:00',
    ended_at = '2024-03-15 10:00:00'
WHERE id = 'sub_free_123';

-- Create new paid subscription
INSERT INTO subscriptions (
    customer_id, product_id, price_id,
    status, trial_start, trial_end,
    amount, currency
) VALUES (
    'cus_123', 'prod_basic', 'price_basic_monthly',
    'trialing', '2024-03-15', '2024-03-29',
    2900, 'usd'
);
```

**Customer Communication:**
```
Subject: Welcome to Basic Plan! Your 14-day trial starts now

Hi Bob,

Thanks for upgrading to our Basic Plan! Your 14-day trial has started.

Trial ends: March 29, 2024
First charge: $29.00 on March 29, 2024

What's included:
- Up to 100 customers
- Advanced analytics
- API access
- Email support

Manage subscription: [Link to Portal]
```

### Scenario 2: Basic → Pro (Same Billing Cycle)

**Context:**
- Customer: Alice's Agency
- Current: Basic Plan ($29/month) since March 1st
- Upgrade to: Pro Plan ($99/month)
- Date: March 15th (mid-cycle)

**Proration Calculation:**
```
Billing Period: March 1 - March 31 (31 days)
Upgrade Date: March 15 (Day 15)

Days Used on Basic: 14
Days Remaining: 17

Basic Plan Unused Credit: $29 × (17/31) = $15.90
Pro Plan Charge for Remaining Days: $99 × (17/31) = $54.29

Amount Due Today: $54.29 - $15.90 = $38.39
Next Full Charge: $99 on April 1st
```

**Stripe API Call:**
```javascript
const update = await stripe.subscriptions.update('sub_123', {
  items: [{
    id: 'si_123',
    price: 'price_pro_monthly',
  }],
  proration_behavior: 'create_prorations',
  proration_date: Math.floor(Date.now() / 1000),
});
```

**Invoice Generated:**
```
Invoice #INV-2024-001
Date: March 15, 2024

Line Items:
1. Unused time on Basic Plan (Mar 15-31)     -$15.90
2. Remaining time on Pro Plan (Mar 15-31)    +$54.29
                                              -------
Subtotal:                                     $38.39
Tax (0%):                                      $0.00
                                              -------
Total Due:                                    $38.39

Payment Method: •••• 4242
Status: Paid
```

### Scenario 3: Monthly → Annual (Billing Cycle Change)

**Context:**
- Current: Pro Monthly ($99/month) since January 1st
- Upgrade to: Pro Annual ($950/year - save $238!)
- Date: March 15th

**Calculation:**
```
Current Monthly Billing: Jan 1 - Mar 31
Days Used This Period: March 1-15 (15 days)
Days Remaining in March: 16 days

March Credit: $99 × (16/31) = $51.10
Annual Plan Cost: $950.00

Amount Due Today: $950.00 - $51.10 = $898.90
Next Billing Date: March 15, 2025
```

**Benefits Highlighted:**
```
Switching to Annual Billing:
- Monthly cost: $99 × 12 = $1,188
- Annual cost: $950
- Your savings: $238/year (20% off!)
- Lock in this rate for 12 months
```

---

## Downgrade Scenarios

### Scenario 4: Pro → Basic (End of Period)

**Context:**
- Current: Pro Plan ($99/month)
- Downgrade to: Basic Plan ($29/month)
- Request Date: March 15th
- Effective Date: April 1st (end of current period)

**System Behavior:**
```
1. Schedule downgrade for period end
2. Customer keeps Pro features until March 31
3. No refund issued (keep what you paid for)
4. Switch to Basic on April 1st
5. Next charge: $29 on April 1st
```

**Database Record:**
```sql
INSERT INTO subscription_changes (
    subscription_id, change_type,
    from_price_id, to_price_id,
    from_amount, to_amount,
    status, scheduled_for
) VALUES (
    'sub_123', 'downgrade',
    'price_pro_monthly', 'price_basic_monthly',
    9900, 2900,
    'scheduled', '2024-04-01 00:00:00'
);
```

**Customer Email:**
```
Subject: Your plan downgrade is scheduled

Your downgrade from Pro to Basic has been scheduled.

Current Plan: Pro ($99/month)
New Plan: Basic ($29/month)
Change Date: April 1, 2024

Until April 1st, you'll continue to have access to all Pro features.

Want to keep Pro? You can cancel this change anytime before April 1st.
[Cancel Downgrade] button
```

### Scenario 5: Enterprise → Pro (With Account Credit)

**Context:**
- Current: Enterprise Annual ($5,000/year)
- Paid: January 1st for full year
- Downgrade to: Pro Annual ($950/year)
- Date: April 1st (3 months into annual plan)

**Credit Calculation (Phase 2):**
```
Annual Period: Jan 1 - Dec 31 (365 days)
Days Used: 90 days (Jan 1 - Mar 31)
Days Remaining: 275 days

Enterprise Unused Value: $5,000 × (275/365) = $3,767.12
Pro Plan Cost for Remaining: $950 × (275/365) = $715.75

Account Credit Issued: $3,767.12 - $715.75 = $3,051.37
```

**Credit Application:**
```
Account Credit Balance: $3,051.37
Expires: March 31, 2025 (1 year)

This credit will be automatically applied to future invoices.
```

---

## API Request/Response Examples

### Preview Upgrade Request

**Request:**
```http
POST /api/v1/subscriptions/sub_123/preview-change
Content-Type: application/json
Authorization: Bearer sk_live_...

{
  "newPriceId": "price_pro_monthly",
  "effectiveDate": "immediate"
}
```

**Response:**
```json
{
  "currentPlan": {
    "id": "prod_basic",
    "name": "Basic Plan",
    "amount": 2900,
    "currency": "usd",
    "interval": "month"
  },
  "newPlan": {
    "id": "prod_pro",
    "name": "Pro Plan",
    "amount": 9900,
    "currency": "usd",
    "interval": "month"
  },
  "proration": {
    "periodStart": "2024-03-01",
    "periodEnd": "2024-03-31",
    "changeDate": "2024-03-15",
    "daysRemaining": 17,
    "unusedCredit": 1590,
    "newPlanCharge": 5429,
    "immediatePayment": 3839
  },
  "effectiveDate": "2024-03-15T10:30:00Z",
  "nextBillingDate": "2024-04-01",
  "nextBillingAmount": 9900
}
```

### Execute Upgrade Request

**Request:**
```http
POST /api/v1/subscriptions/sub_123/change-plan
Content-Type: application/json
Authorization: Bearer sk_live_...

{
  "newPriceId": "price_pro_monthly",
  "confirmAmount": 3839,
  "effectiveDate": "immediate"
}
```

**Response (Success):**
```json
{
  "subscription": {
    "id": "sub_123",
    "status": "active",
    "currentPeriodStart": "2024-03-01",
    "currentPeriodEnd": "2024-03-31",
    "product": {
      "id": "prod_pro",
      "name": "Pro Plan"
    },
    "price": {
      "id": "price_pro_monthly",
      "amount": 9900,
      "interval": "month"
    }
  },
  "change": {
    "id": "change_456",
    "type": "upgrade",
    "fromAmount": 2900,
    "toAmount": 9900,
    "prorationAmount": 3839,
    "status": "completed",
    "completedAt": "2024-03-15T10:30:00Z"
  },
  "invoice": {
    "id": "inv_789",
    "amount": 3839,
    "status": "paid",
    "paidAt": "2024-03-15T10:30:05Z",
    "hostedUrl": "https://pay.stripe.com/invoice/..."
  }
}
```

**Response (Amount Mismatch Error):**
```json
{
  "error": {
    "type": "invalid_request",
    "message": "The confirm amount (3000) doesn't match the calculated amount (3839). Please refresh and try again.",
    "code": "amount_mismatch",
    "expectedAmount": 3839,
    "providedAmount": 3000
  }
}
```

### Get Available Plans

**Request:**
```http
GET /api/v1/subscriptions/sub_123/available-plans
Authorization: Bearer sk_live_...
```

**Response:**
```json
{
  "currentPlan": {
    "id": "prod_basic",
    "name": "Basic Plan",
    "amount": 2900,
    "interval": "month",
    "features": ["100 customers", "Basic analytics", "Email support"]
  },
  "availableUpgrades": [
    {
      "id": "prod_pro",
      "name": "Pro Plan",
      "amount": 9900,
      "interval": "month",
      "features": ["1000 customers", "Advanced analytics", "Priority support"],
      "popularChoice": true
    },
    {
      "id": "prod_enterprise",
      "name": "Enterprise Plan",
      "amount": 29900,
      "interval": "month",
      "features": ["Unlimited customers", "Custom analytics", "Dedicated support"]
    }
  ],
  "availableDowngrades": [
    {
      "id": "prod_free",
      "name": "Free Plan",
      "amount": 0,
      "interval": "month",
      "features": ["10 customers", "Basic features"],
      "warning": "You'll lose access to premium features"
    }
  ],
  "restrictions": [
    "Annual plans require contacting support to change"
  ]
}
```

---

## Proration Calculations

### Daily Proration (30-day month)

```javascript
function calculateDailyProration(currentPrice, newPrice, dayOfMonth) {
  const totalDays = 30;
  const daysUsed = dayOfMonth - 1;
  const daysRemaining = totalDays - daysUsed;

  const unusedCredit = (currentPrice * daysRemaining) / totalDays;
  const newCharge = (newPrice * daysRemaining) / totalDays;

  return {
    credit: Math.round(unusedCredit * 100) / 100,
    charge: Math.round(newCharge * 100) / 100,
    net: Math.round((newCharge - unusedCredit) * 100) / 100
  };
}

// Example: Upgrade on day 15 of 30
// Basic ($29) → Pro ($99)
calculateDailyProration(29, 99, 15);
// Returns: { credit: 14.50, charge: 49.50, net: 35.00 }
```

### Exact Proration (Actual days in month)

```javascript
function calculateExactProration(currentPrice, newPrice, changeDate) {
  const periodStart = startOfMonth(changeDate);
  const periodEnd = endOfMonth(changeDate);
  const totalDays = differenceInDays(periodEnd, periodStart) + 1;
  const daysUsed = differenceInDays(changeDate, periodStart);
  const daysRemaining = totalDays - daysUsed;

  const unusedCredit = (currentPrice * daysRemaining) / totalDays;
  const newCharge = (newPrice * daysRemaining) / totalDays;

  return {
    credit: Math.round(unusedCredit * 100) / 100,
    charge: Math.round(newCharge * 100) / 100,
    net: Math.round((newCharge - unusedCredit) * 100) / 100,
    details: {
      totalDays,
      daysUsed,
      daysRemaining
    }
  };
}
```

### Annual Proration

```javascript
function calculateAnnualProration(currentPrice, newPrice, monthsUsed) {
  const totalMonths = 12;
  const monthsRemaining = totalMonths - monthsUsed;

  const unusedCredit = (currentPrice * monthsRemaining) / totalMonths;
  const newCharge = (newPrice * monthsRemaining) / totalMonths;

  return {
    credit: Math.round(unusedCredit * 100) / 100,
    charge: Math.round(newCharge * 100) / 100,
    net: Math.round((newCharge - unusedCredit) * 100) / 100,
    monthsRemaining
  };
}

// Example: Annual upgrade after 3 months
// Basic Annual ($300) → Pro Annual ($900)
calculateAnnualProration(300, 900, 3);
// Returns: { credit: 225.00, charge: 675.00, net: 450.00, monthsRemaining: 9 }
```

---

## Edge Case Examples

### Edge Case 1: Multiple Upgrades in Same Period

**Scenario:**
- March 1: Basic ($29/month) subscription starts
- March 10: Upgrade to Pro ($99/month)
- March 20: Upgrade to Enterprise ($299/month)

**Calculation for March 20 upgrade:**
```
Period: March 1-31 (31 days)

Charges already paid:
- Basic (Mar 1): $29.00
- Pro upgrade (Mar 10): $49.84 (prorated)
Total Paid: $78.84

Fair Value Calculation:
- Basic (Mar 1-9): $29 × (9/31) = $8.42
- Pro (Mar 10-19): $99 × (10/31) = $31.94
- Enterprise (Mar 20-31): $299 × (12/31) = $115.74
Total Fair Value: $156.10

Amount Due: $156.10 - $78.84 = $77.26
```

### Edge Case 2: Upgrade During Trial

**Scenario:**
- Customer on Basic trial (14 days remaining)
- Upgrades to Pro plan

**Options:**

**Option A: Preserve Trial**
```json
{
  "action": "preserve_trial",
  "subscription": {
    "plan": "Pro",
    "status": "trialing",
    "trialEnd": "2024-03-29",
    "amount": 9900,
    "nextCharge": "2024-03-29"
  }
}
```

**Option B: End Trial & Charge**
```json
{
  "action": "end_trial",
  "subscription": {
    "plan": "Pro",
    "status": "active",
    "amount": 9900,
    "immediateCharge": 9900
  }
}
```

**Decision:** Use Option A (preserve trial) for better customer experience

### Edge Case 3: Downgrade with Pending Invoice

**Scenario:**
- Customer has $99 unpaid invoice from last month
- Attempts to downgrade from Pro to Basic

**System Response:**
```json
{
  "error": {
    "type": "pending_payment",
    "message": "Please pay your outstanding balance before changing plans",
    "outstandingAmount": 9900,
    "invoiceId": "inv_123",
    "paymentUrl": "https://pay.stripe.com/..."
  }
}
```

### Edge Case 4: Same Price "Upgrade"

**Scenario:**
- Current: Pro Monthly ($99/month)
- "Upgrade" to: Pro Plus Monthly ($99/month) - different features

**Handling:**
```javascript
// No proration needed, just switch the plan
if (currentPrice === newPrice && interval === newInterval) {
  // Direct switch, no invoice
  await stripe.subscriptions.update(subId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: 'none',
  });
}
```

---

## UI Flow Examples

### Upgrade Flow UI

```
1. Current Plan Display
┌─────────────────────────────────┐
│ Your Current Plan               │
│ ┌─────────────────────────────┐ │
│ │ BASIC PLAN                  │ │
│ │ $29/month                   │ │
│ │ • 100 customers             │ │
│ │ • Basic analytics           │ │
│ │ • Email support             │ │
│ │                             │ │
│ │ [Change Plan]               │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘

2. Plan Selection
┌─────────────────────────────────────────────────┐
│ Choose Your New Plan                           │
│                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ BASIC    │ │ PRO ⭐   │ │ENTERPRISE│       │
│ │ Current  │ │ Popular  │ │          │       │
│ │ $29/mo   │ │ $99/mo   │ │ $299/mo  │       │
│ │          │ │          │ │          │       │
│ │ ✓ 100    │ │ ✓ 1000   │ │ ✓ Unlimited     │
│ │ ✓ Basic  │ │ ✓ Advanced│ │ ✓ Custom │      │
│ │ ✓ Email  │ │ ✓ Priority│ │ ✓ Dedicated    │
│ │          │ │          │ │          │       │
│ │[Current] │ │[Select]  │ │[Select]  │       │
│ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────┘

3. Proration Preview
┌─────────────────────────────────────────────────┐
│ Confirm Your Upgrade                           │
│                                                 │
│ Upgrading from Basic to Pro                    │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ Billing Adjustment                       │   │
│ │                                           │   │
│ │ Unused Basic (Mar 15-31)    -$15.90     │   │
│ │ Pro Plan (Mar 15-31)        +$54.29     │   │
│ │ ─────────────────────────────────────   │   │
│ │ Due Today                    $38.39     │   │
│ │                                           │   │
│ │ Starting April 1st: $99.00/month        │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ [Cancel]                    [Confirm Upgrade]  │
└─────────────────────────────────────────────────┘

4. Success Confirmation
┌─────────────────────────────────────────────────┐
│ ✅ Upgrade Successful!                         │
│                                                 │
│ You're now on the Pro Plan                     │
│                                                 │
│ • Charged $38.39 today                         │
│ • Next billing: $99.00 on April 1st           │
│ • Invoice: #INV-2024-001 [Download]           │
│                                                 │
│ Your new features are available immediately:   │
│ • 1000 customer limit                          │
│ • Advanced analytics                           │
│ • Priority support                             │
│                                                 │
│                           [Go to Dashboard]    │
└─────────────────────────────────────────────────┘
```

### Downgrade Flow UI

```
1. Downgrade Warning
┌─────────────────────────────────────────────────┐
│ ⚠️ Downgrade Confirmation                       │
│                                                 │
│ You're downgrading from Pro to Basic          │
│                                                 │
│ You'll lose access to:                         │
│ • 900 customer capacity (currently using 450)  │
│ • Advanced analytics                           │
│ • Priority support                             │
│                                                 │
│ When will this happen?                         │
│ ○ Immediately (no refund)                      │
│ ⦿ At end of billing period (March 31)         │
│                                                 │
│ After March 31: $29.00/month                  │
│                                                 │
│ [Keep Pro Plan]           [Confirm Downgrade]  │
└─────────────────────────────────────────────────┘

2. Scheduled Confirmation
┌─────────────────────────────────────────────────┐
│ Downgrade Scheduled                            │
│                                                 │
│ Your downgrade is scheduled for March 31       │
│                                                 │
│ Until then:                                    │
│ • Keep all Pro features                        │
│ • No additional charges                        │
│ • Can cancel this change anytime              │
│                                                 │
│ Starting April 1st:                            │
│ • Basic Plan ($29/month)                       │
│ • Limited to 100 customers                     │
│                                                 │
│                              [Close]           │
└─────────────────────────────────────────────────┘
```

---

## Merchant Configuration Examples (Phase 2)

### Configuration UI

```
Billing Settings for Your Organization

Upgrade Policy
○ Immediate with proration (recommended)
○ Wait until period end
⦿ Let customer choose

Downgrade Policy
⦿ At period end (no refund)
○ Immediate with account credit
○ Block downgrades

Refund Policy
○ No refunds
⦿ Account credit only
○ Cash refunds (requires approval)

Free Trial Settings
☑ Offer trial on free→paid upgrade
☐ Preserve trial on plan changes
Trial Length: [14] days

[Save Settings]
```

### Configuration Impact Examples

**Merchant A: Immediate Everything**
```json
{
  "upgradeTiming": "immediate",
  "downgradeTiming": "immediate",
  "prorationEnabled": true,
  "refundPolicy": "account_credit"
}
```
Result: All changes happen instantly with fair proration

**Merchant B: Conservative**
```json
{
  "upgradeTiming": "period_end",
  "downgradeTiming": "period_end",
  "prorationEnabled": false,
  "refundPolicy": "no_refunds"
}
```
Result: All changes wait until next billing cycle

**Merchant C: Customer Choice**
```json
{
  "upgradeTiming": "customer_choice",
  "downgradeTiming": "period_end",
  "prorationEnabled": true,
  "refundPolicy": "account_credit"
}
```
Result: Customers see both options when upgrading

---

## Testing Scenarios

### Test Case 1: Free Trial Upgrade Path
```
Given: Customer on 14-day free trial of Basic
When: Upgrades to Pro on day 7
Then:
  - Trial continues for 7 more days
  - Plan switches to Pro
  - First charge will be $99 (not prorated)
```

### Test Case 2: Rapid Plan Changes
```
Given: Customer on Basic plan
When:
  1. Upgrades to Pro
  2. Immediately upgrades to Enterprise
  3. Then downgrades to Pro
All within 5 minutes
Then:
  - Only final change (Pro) is applied
  - Single charge for the net difference
  - Audit log shows all attempts
```

### Test Case 3: Currency Edge Cases
```
Given: Customer on USD plan ($99)
When: Attempts to switch to EUR plan (€89)
Then:
  - System blocks the change
  - Shows error: "Cannot change currency mid-subscription"
  - Suggests canceling and resubscribing
```

---

## Troubleshooting Guide

### Common Issues

**Issue 1: Proration Seems Wrong**
```
Customer Says: "I was charged $50 but should be $40"

Check:
1. Exact dates of period and change
2. Whether tax was applied
3. Previous changes in same period
4. Regional pricing differences

Debug Query:
SELECT * FROM subscription_changes
WHERE subscription_id = ?
AND created_at > CURRENT_DATE - INTERVAL '30 days';
```

**Issue 2: Upgrade Failed but Charged**
```
Symptoms:
- Payment succeeded
- Subscription still on old plan

Steps:
1. Check webhook logs for failures
2. Verify Stripe subscription status
3. Look for database transaction rollback
4. Manually reconcile if needed

Recovery:
await reconcileSubscription(customerId);
```

**Issue 3: Can't Downgrade**
```
Possible Reasons:
- Unpaid invoices
- Already has scheduled change
- Plan no longer available
- Quantity exceeds new plan limits

Resolution:
- Pay outstanding balance
- Cancel pending changes
- Contact support for special migration
```

---

## Support Templates

### Upgrade Confirmation Email
```
Subject: Welcome to [Plan Name]!

Hi [Customer Name],

Your upgrade to [Plan Name] is complete!

What changed:
- Previous plan: [Old Plan] ($[Old Price]/[interval])
- New plan: [Plan Name] ($[New Price]/[interval])
- Amount paid today: $[Prorated Amount]
- Next billing date: [Date] ($[Full Amount])

Your new features:
[Feature List]

Questions? Reply to this email or visit our help center.

Best,
The BillingOS Team
```

### Downgrade Scheduled Email
```
Subject: Your plan change is scheduled

Hi [Customer Name],

We've scheduled your downgrade as requested.

Current plan: [Current Plan] ($[Current Price]/[interval])
New plan: [New Plan] ($[New Price]/[interval])
Change date: [Date]

Until [Date], you'll keep all your current features.

Changed your mind? You can cancel this change anytime:
[Cancel Downgrade Button]

Best,
The BillingOS Team
```

---

This examples document provides concrete scenarios and calculations for the subscription upgrade/downgrade feature. It serves as a reference for implementation, testing, and customer support.