# Using Platform Fees in Payment Processing

## Configuration Summary

**Platform Fee:** 0.6% + $0.10
**Stripe Fee:** 2.9% + $0.30
**Total Fee:** 3.5% + $0.40

**Fee Model:** Merchant absorbs all fees

---

## Example: $100 Sale

```
Customer pays: $100.00
├─ Stripe takes: $3.20 (2.9% + $0.30)
├─ BillingOS takes: $0.70 (0.6% + $0.10)
└─ Merchant receives: $96.10
```

**Merchant Dashboard Shows:**
```
Sale Amount:    $100.00
Stripe Fee:      -$3.20
Platform Fee:    -$0.70
─────────────────────────
You Receive:     $96.10
```

---

## How to Use in Payment Processing

### Step 1: Get Account Fees from Database

```typescript
// In your payment service
const { data: account } = await supabase
  .from('accounts')
  .select('platform_fee_percent, platform_fee_fixed, stripe_id')
  .eq('id', accountId)
  .single();

if (!account) {
  throw new Error('Account not found');
}
```

### Step 2: Calculate Application Fee

**Option A: Using the Helper Service (Recommended)**

```typescript
import { StripFeesService } from '../stripe/stripe-fees.service';

constructor(private readonly feesService: StripFeesService) {}

// Calculate application fee
const paymentAmount = 10000; // $100.00 in cents
const applicationFee = this.feesService.calculateApplicationFee(
  paymentAmount,
  account.platform_fee_percent,
  account.platform_fee_fixed
);

// Returns: 70 (cents) = $0.70
```

**Option B: Manual Calculation**

```typescript
const paymentAmount = 10000; // $100.00 in cents

let applicationFee = 0;

// Add percentage fee
if (account.platform_fee_percent) {
  applicationFee += Math.round(
    (paymentAmount * account.platform_fee_percent) / 10000
  );
}

// Add fixed fee
if (account.platform_fee_fixed) {
  applicationFee += account.platform_fee_fixed;
}

// Result: 70 cents = $0.70
```

### Step 3: Create Payment Intent with Application Fee

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create payment on the connected account with application fee
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: paymentAmount,              // $100.00
    currency: 'usd',
    application_fee_amount: applicationFee,  // $0.70 goes to platform
    // ... other parameters (customer, metadata, etc.)
  },
  {
    stripeAccount: account.stripe_id,   // Connected account ID
  }
);

// Stripe automatically:
// 1. Charges customer $100.00
// 2. Deducts Stripe's fee: $3.20
// 3. Transfers application fee to platform: $0.70
// 4. Connected account receives: $96.10
```

---

## Get Fee Breakdown for Display

### For Merchant Dashboard

```typescript
import { StripFeesService } from '../stripe/stripe-fees.service';

constructor(private readonly feesService: StripFeesService) {}

// Get complete fee breakdown
const breakdown = this.feesService.calculateTotalFees(
  10000, // $100
  account.platform_fee_percent,
  account.platform_fee_fixed
);

console.log(breakdown);
/*
{
  stripeFee: 320,           // $3.20
  platformFee: 70,          // $0.70
  totalFees: 390,           // $3.90
  merchantReceives: 9610,   // $96.10
  breakdown: {
    stripePercent: 290,     // $2.90
    stripeFixed: 30,        // $0.30
    platformPercent: 60,    // $0.60
    platformFixed: 10       // $0.10
  }
}
*/
```

### Formatted for UI

```typescript
const formatted = this.feesService.formatFeeBreakdown(
  10000,
  account.platform_fee_percent,
  account.platform_fee_fixed
);

console.log(formatted);
/*
Sale Amount: $100.00
Stripe Fee: -$3.20 (2.9% + $0.30)
Platform Fee: -$0.70 (0.60% + $0.10)
─────────────────────────
You Receive: $96.10
*/
```

---

## Full Payment Flow Example

### Create Payment Endpoint

**File:** `apps/api/src/payment/payment.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { StripFeesService } from '../stripe/stripe-fees.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly feesService: StripFeesService,
  ) {}

  async createPayment(
    accountId: string,
    amount: number,
    currency: string = 'usd'
  ) {
    const supabase = this.supabaseService.getClient();

    // 1. Get account with fee configuration
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (!account || !account.stripe_id) {
      throw new Error('Invalid account');
    }

    // 2. Calculate application fee
    const applicationFee = this.feesService.calculateApplicationFee(
      amount,
      account.platform_fee_percent,
      account.platform_fee_fixed
    );

    // 3. Create payment intent on connected account
    const stripe = this.stripeService.getClient();
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency,
        application_fee_amount: applicationFee,
        metadata: {
          account_id: accountId,
          platform_fee: applicationFee.toString(),
        },
      },
      {
        stripeAccount: account.stripe_id,
      }
    );

    // 4. Store payment in database (future: create payments table)
    // await this.createPaymentRecord(paymentIntent, account, applicationFee);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      fees: this.feesService.calculateTotalFees(
        amount,
        account.platform_fee_percent,
        account.platform_fee_fixed
      ),
    };
  }
}
```

### Frontend Integration

**File:** `apps/web/src/hooks/usePayment.ts`

```typescript
import { useState } from 'react';
import { api } from '@/lib/api/client';

export function useCreatePayment() {
  const [loading, setLoading] = useState(false);

  const createPayment = async (accountId: string, amount: number) => {
    setLoading(true);
    try {
      const response = await api.post<{
        clientSecret: string;
        fees: any;
      }>('/payments', {
        account_id: accountId,
        amount,
      });

      return response;
    } finally {
      setLoading(false);
    }
  };

  return { createPayment, loading };
}
```

**Usage in Component:**

```typescript
const { createPayment } = useCreatePayment();

const handleCheckout = async () => {
  // Create payment with fees automatically calculated
  const { clientSecret, fees } = await createPayment(
    organizationAccountId,
    10000 // $100.00
  );

  // Show merchant what they'll receive
  console.log('You will receive:', fees.merchantReceives); // $96.10

  // Continue with Stripe checkout...
  // Use clientSecret with Stripe Elements
};
```

---

## Testing

### Test Calculations

```typescript
import { Test } from '@nestjs/testing';
import { StripFeesService } from './stripe-fees.service';

describe('Platform Fees', () => {
  let service: StripFeesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [StripFeesService],
    }).compile();

    service = module.get<StripFeesService>(StripFeesService);
  });

  it('should calculate correct application fee for $100', () => {
    const fee = service.calculateApplicationFee(10000, 60, 10);
    expect(fee).toBe(70); // $0.70
  });

  it('should calculate total fees correctly', () => {
    const breakdown = service.calculateTotalFees(10000, 60, 10);
    expect(breakdown.stripeFee).toBe(320); // $3.20
    expect(breakdown.platformFee).toBe(70); // $0.70
    expect(breakdown.totalFees).toBe(390); // $3.90
    expect(breakdown.merchantReceives).toBe(9610); // $96.10
  });
});
```

### Test with Stripe CLI

```bash
# Create a test payment
stripe payment_intents create \
  --amount 10000 \
  --currency usd \
  --application-fee-amount 70 \
  --stripe-account acct_test123
```

---

## Important Notes

### 1. Application Fees Are Automatic

Once you set `application_fee_amount`, Stripe handles everything:
- ✅ Transfers fee to your platform account
- ✅ Deducts from connected account balance
- ✅ Shows in both dashboards
- ✅ Included in payouts

### 2. Refund Handling

When refunding a payment:

```typescript
// Refund payment (application fee is NOT refunded by default)
const refund = await stripe.refunds.create(
  {
    payment_intent: paymentIntentId,
  },
  {
    stripeAccount: account.stripe_id,
  }
);

// Optionally refund application fee too
const refund = await stripe.refunds.create(
  {
    payment_intent: paymentIntentId,
    refund_application_fee: true, // Add this to refund platform fee
  },
  {
    stripeAccount: account.stripe_id,
  }
);
```

### 3. Fee Limits

- Application fee cannot exceed payment amount
- Recommended: Keep under 20% of transaction
- Current setup: 0.6% + $0.10 = ~0.7% on $100 ✅

### 4. Tax Reporting

- Application fees are your platform's revenue
- Track via Stripe Dashboard: Connect > Application fees
- May need to issue 1099s (US) for connected accounts

---

## Monitoring Revenue

### Stripe Dashboard

**View Platform Revenue:**
1. Go to: https://dashboard.stripe.com/connect/application_fees
2. See all application fees collected
3. Export for accounting

**Query via API:**

```typescript
// Get last 30 days of application fees
const fees = await stripe.applicationFees.list({
  limit: 100,
  created: {
    gte: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60),
  },
});

const totalRevenue = fees.data.reduce(
  (sum, fee) => sum + fee.amount,
  0
);

console.log(`Platform revenue: $${(totalRevenue / 100).toFixed(2)}`);
```

### Database Query (Future)

When you create `payments` table:

```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as payment_count,
  SUM(amount) as total_sales,
  SUM(application_fee_amount) as platform_revenue
FROM payments
WHERE status = 'succeeded'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Quick Reference

### Fee Calculation Formula

```typescript
// Percentage fee
percentFee = (amount * platform_fee_percent) / 10000

// Total application fee
applicationFee = percentFee + platform_fee_fixed
```

### Example Fees for Common Amounts

| Amount | Stripe Fee | Platform Fee | Total Fees | Merchant Gets |
|--------|-----------|--------------|------------|---------------|
| $10    | $0.59     | $0.16        | $0.75      | $9.25         |
| $50    | $1.75     | $0.40        | $2.15      | $47.85        |
| $100   | $3.20     | $0.70        | $3.90      | $96.10        |
| $500   | $14.80    | $3.10        | $17.90     | $482.10       |
| $1000  | $29.30    | $6.10        | $35.40     | $964.60       |

---

## Summary

✅ **Configured:** Platform fees set to 0.6% + $0.10
✅ **Helper Service:** `StripFeesService` ready to use
✅ **Environment Variables:** Configurable via `.env`
✅ **Documentation:** Full payment flow documented

**Next Steps When Adding Payments:**
1. Import `StripFeesService` in your payment service
2. Call `calculateApplicationFee()` before creating PaymentIntent
3. Pass `application_fee_amount` to Stripe
4. Display fee breakdown to merchants in dashboard

Your platform fee setup is complete and ready to use! 🎉
