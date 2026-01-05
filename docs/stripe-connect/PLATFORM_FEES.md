# Stripe Connect Platform Fees Configuration

## Overview

Platform fees allow you to earn revenue from payments processed through your Connected accounts. BillingOS supports two types of fees:

1. **Percentage Fee** - A percentage of each transaction (e.g., 2.5%)
2. **Fixed Fee** - A flat amount per transaction (e.g., $0.30)

You can use one or both together (e.g., 2.9% + $0.30).

---

## Database Configuration

### Accounts Table Fields

Located in: `accounts` table

```sql
-- Platform fees (can be customized per account)
processor_fees_applicable BOOLEAN NOT NULL DEFAULT true,
platform_fee_percent INTEGER,        -- Basis points (500 = 5%)
platform_fee_fixed INTEGER,          -- Fixed fee in cents
```

**Important:**
- `platform_fee_percent` is in **basis points** (1% = 100 basis points)
  - Example: `500` = 5%, `250` = 2.5%, `290` = 2.9%
- `platform_fee_fixed` is in **cents**
  - Example: `30` = $0.30, `50` = $0.50

---

## Setting Platform Fees

### Option 1: Set Default Fees for All Accounts

Add to your `.env` file:

```bash
# Default platform fees (applied to new accounts)
DEFAULT_PLATFORM_FEE_PERCENT=250    # 2.5%
DEFAULT_PLATFORM_FEE_FIXED=30       # $0.30
```

Then update the account creation logic:

**File:** `apps/api/src/account/account.service.ts:71`

```typescript
const { data: account, error } = await supabase
  .from('accounts')
  .insert({
    account_type: 'stripe',
    admin_id: user.id,
    stripe_id: stripeAccount.id,
    email: stripeAccount.email || createDto.email,
    country: stripeAccount.country || createDto.country,
    currency: stripeAccount.default_currency || null,
    is_details_submitted: stripeAccount.details_submitted || false,
    is_charges_enabled: stripeAccount.charges_enabled || false,
    is_payouts_enabled: stripeAccount.payouts_enabled || false,
    business_type: stripeAccount.business_type || createDto.business_type,
    status: 'onboarding_started',
    data: stripeAccount as any,
    // ADD THESE LINES:
    platform_fee_percent: this.configService.get<number>('DEFAULT_PLATFORM_FEE_PERCENT') || null,
    platform_fee_fixed: this.configService.get<number>('DEFAULT_PLATFORM_FEE_FIXED') || null,
  })
  .select()
  .single();
```

---

### Option 2: Set Custom Fees Per Account

#### Via Database (Manual)

```sql
-- Set fees for a specific account
UPDATE accounts
SET
  platform_fee_percent = 250,  -- 2.5%
  platform_fee_fixed = 30      -- $0.30
WHERE id = 'account-uuid';
```

#### Via API Endpoint (Recommended)

Create a new endpoint to update platform fees:

**File:** `apps/api/src/account/dto/update-platform-fees.dto.ts` (create this)

```typescript
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdatePlatformFeesDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10000) // Max 100%
  platform_fee_percent?: number; // Basis points

  @IsNumber()
  @IsOptional()
  @Min(0)
  platform_fee_fixed?: number; // Cents
}
```

**File:** `apps/api/src/account/account.controller.ts`

```typescript
/**
 * Update platform fees for an account
 */
@Patch(':id/fees')
updatePlatformFees(
  @Param('id') id: string,
  @CurrentUser() user: User,
  @Body() feesDto: UpdatePlatformFeesDto,
) {
  return this.accountService.updatePlatformFees(id, user.id, feesDto);
}
```

**File:** `apps/api/src/account/account.service.ts`

```typescript
/**
 * Update platform fees for an account
 */
async updatePlatformFees(
  accountId: string,
  userId: string,
  feesDto: UpdatePlatformFeesDto,
): Promise<Account> {
  // Verify user has access
  await this.findOne(accountId, userId);

  const supabase = this.supabaseService.getClient();

  const { data, error } = await supabase
    .from('accounts')
    .update({
      platform_fee_percent: feesDto.platform_fee_percent,
      platform_fee_fixed: feesDto.platform_fee_fixed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select()
    .single();

  if (error || !data) {
    throw new Error('Failed to update platform fees');
  }

  this.logger.log(`Platform fees updated for account ${accountId}`);
  return data;
}
```

---

## Applying Platform Fees to Payments

### Using Stripe Application Fees

When creating a PaymentIntent or Charge, apply the application fee:

**Example: Payment with Platform Fee**

```typescript
// Get account fees from database
const { data: account } = await supabase
  .from('accounts')
  .select('platform_fee_percent, platform_fee_fixed')
  .eq('id', accountId)
  .single();

// Calculate application fee
const paymentAmount = 10000; // $100.00 in cents
let applicationFee = 0;

if (account.platform_fee_percent) {
  // Calculate percentage fee
  applicationFee += Math.round((paymentAmount * account.platform_fee_percent) / 10000);
}

if (account.platform_fee_fixed) {
  // Add fixed fee
  applicationFee += account.platform_fee_fixed;
}

// Example: 2.5% + $0.30 on $100 = $2.80
// (10000 * 250 / 10000) + 30 = 250 + 30 = 280 cents = $2.80

// Create payment with application fee
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: paymentAmount,
    currency: 'usd',
    application_fee_amount: applicationFee,
    // ... other parameters
  },
  {
    stripeAccount: account.stripe_id, // Connected account
  }
);
```

---

## Example Fee Configurations

### Standard SaaS Platform (Stripe-like)
```sql
platform_fee_percent = 290   -- 2.9%
platform_fee_fixed = 30      -- $0.30
```
- $10 payment = $0.59 fee ($0.29 + $0.30)
- $100 payment = $3.20 fee ($2.90 + $0.30)
- $1000 payment = $29.30 fee ($29.00 + $0.30)

### Marketplace (Lower %)
```sql
platform_fee_percent = 250   -- 2.5%
platform_fee_fixed = 0       -- No fixed fee
```
- $10 payment = $0.25 fee
- $100 payment = $2.50 fee
- $1000 payment = $25.00 fee

### High-Value Transactions (Lower % + Fixed)
```sql
platform_fee_percent = 100   -- 1%
platform_fee_fixed = 100     -- $1.00
```
- $10 payment = $1.10 fee ($0.10 + $1.00)
- $100 payment = $2.00 fee ($1.00 + $1.00)
- $1000 payment = $11.00 fee ($10.00 + $1.00)

### Freemium (No platform fees initially)
```sql
platform_fee_percent = NULL
platform_fee_fixed = NULL
```
- No fees collected (for beta/free tier accounts)

---

## Admin Dashboard UI (Future Enhancement)

Create an admin page to manage platform fees:

**Page:** `/admin/accounts/[accountId]/fees`

**Features:**
- View current fee configuration
- Update percentage fee (with preview)
- Update fixed fee (with preview)
- Fee calculator (input amount, see breakdown)
- Revenue analytics (total fees collected)

**Component Example:**

```tsx
export function PlatformFeesManager({ accountId }: { accountId: string }) {
  const [percentFee, setPercentFee] = useState(250); // 2.5%
  const [fixedFee, setFixedFee] = useState(30); // $0.30

  const calculateFee = (amount: number) => {
    const percentAmount = Math.round((amount * percentFee) / 10000);
    const totalFee = percentAmount + fixedFee;
    return { percentAmount, fixedFee, totalFee };
  };

  return (
    <div>
      <h2>Platform Fee Configuration</h2>

      <div>
        <label>Percentage Fee (basis points)</label>
        <input
          type="number"
          value={percentFee}
          onChange={(e) => setPercentFee(Number(e.target.value))}
        />
        <span>{(percentFee / 100).toFixed(2)}%</span>
      </div>

      <div>
        <label>Fixed Fee (cents)</label>
        <input
          type="number"
          value={fixedFee}
          onChange={(e) => setFixedFee(Number(e.target.value))}
        />
        <span>${(fixedFee / 100).toFixed(2)}</span>
      </div>

      <div>
        <h3>Fee Calculator</h3>
        <p>$10: ${(calculateFee(1000).totalFee / 100).toFixed(2)}</p>
        <p>$100: ${(calculateFee(10000).totalFee / 100).toFixed(2)}</p>
        <p>$1000: ${(calculateFee(100000).totalFee / 100).toFixed(2)}</p>
      </div>
    </div>
  );
}
```

---

## Stripe Dashboard Configuration

### Enable Application Fees

1. Go to: https://dashboard.stripe.com/settings/applications
2. Under "OAuth settings" → Enable "OAuth for Standard accounts"
3. This allows you to collect application fees from Connected accounts

### Fee Collection

Application fees are automatically transferred to your platform account:
- **Instant:** Fees are collected immediately when payment succeeds
- **Separate:** Fees go to your platform Stripe account, not the Connected account
- **Reporting:** View in Dashboard > Connect > Application fees

---

## Revenue Tracking

### Query Total Fees Collected

```sql
-- Total platform revenue (future: when payments table exists)
SELECT
  a.id,
  a.stripe_id,
  COUNT(p.id) as payment_count,
  SUM(p.application_fee_amount) as total_fees_cents
FROM accounts a
LEFT JOIN payments p ON p.account_id = a.id
WHERE p.status = 'succeeded'
GROUP BY a.id;
```

### Stripe API Query

```typescript
// Get application fees for the last 30 days
const applicationFees = await stripe.applicationFees.list({
  limit: 100,
  created: {
    gte: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60),
  },
});

const totalRevenue = applicationFees.data.reduce(
  (sum, fee) => sum + fee.amount,
  0
);

console.log(`Platform revenue: $${(totalRevenue / 100).toFixed(2)}`);
```

---

## Important Notes

### Fee Limits

**Stripe's Limit:**
- Application fees can't exceed the payment amount
- Typically keep fees under 20% for user trust

**Recommended Ranges:**
- Percentage: 1% - 5% (100 - 500 basis points)
- Fixed: $0.10 - $1.00 (10 - 100 cents)

### Tax Implications

- Platform fees are considered revenue for your business
- You'll need to issue 1099s if fees exceed $600/year (US)
- Consult with an accountant for tax compliance

### Refunds

When a payment is refunded:
- The customer gets the full amount back
- Application fee is **not** automatically refunded
- You can choose to refund the application fee via Stripe API

---

## Quick Start Checklist

- [ ] Decide on your fee structure (% + fixed)
- [ ] Set default fees in `.env` or database
- [ ] Update account creation logic to include fees
- [ ] Create API endpoint to update fees (optional)
- [ ] Test with Stripe test mode
- [ ] Enable OAuth in Stripe Dashboard
- [ ] Implement fee calculation in payment flow
- [ ] Add revenue tracking/reporting
- [ ] Document fees in your Terms of Service

---

## Summary

**Current State:**
- ✅ Database fields ready (`platform_fee_percent`, `platform_fee_fixed`)
- ⚪ Need to set values (manually or via code)
- ⚪ Need to implement fee calculation in payment flow

**To Get Started:**

1. **Set default fees** in account creation
2. **Apply fees** when creating PaymentIntents
3. **Track revenue** via Stripe Dashboard or custom analytics

**Example Quick Setup:**

```typescript
// In account.service.ts, line 71 (account creation)
platform_fee_percent: 250,  // 2.5%
platform_fee_fixed: 30,     // $0.30
```

This will automatically apply 2.5% + $0.30 to all new accounts!
