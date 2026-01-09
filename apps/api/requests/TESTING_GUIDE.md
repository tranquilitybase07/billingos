# BillingOS API Testing Guide

Complete guide for testing the Subscriptions, Products, and Features APIs using REST Client.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Available Request Files](#available-request-files)
3. [Testing Flow](#testing-flow)
4. [Dummy Data Reference](#dummy-data-reference)
5. [Common Issues](#common-issues)

---

## 🚀 Quick Start

### Prerequisites

1. **Install REST Client Extension** (if not already installed)
   - Open VS Code Extensions (Cmd+Shift+X)
   - Search for "REST Client" by Huachao Mao
   - Click Install

2. **Start Required Services**
   ```bash
   # Terminal 1: Start Supabase
   supabase start

   # Terminal 2: Start API server
   pnpm dev:api

   # Terminal 3 (Optional): Start Stripe CLI for webhooks
   stripe listen --forward-to localhost:3001/stripe/webhooks
   ```

3. **Get Your Auth Token**
   - Login to frontend at http://localhost:3000
   - Your token is already logged in terminal (see `🔑 AUTH TOKEN:`)
   - Or check the token in `apps/api/requests/*.http` files (already populated)

---

## 📁 Available Request Files

| File | Description | Endpoints |
|------|-------------|-----------|
| `users.http` | User profile management | Get profile, update profile, accept terms |
| `organizations.http` | Organization CRUD & members | Create, update, delete orgs, manage members |
| `accounts.http` | Stripe Connect integration | Create account, onboarding, dashboard links |
| **`features.http`** | **Feature management** | Create features, check access, track usage |
| **`products.http`** | **Product & pricing** | Create products with features and prices |
| **`subscriptions.http`** | **Subscriptions** | Create, cancel, list subscriptions |
| `test-setup.sql` | Database test data | Create test customers via SQL |

---

## 🔄 Testing Flow

### Step 1: Setup Test Customers

**Option A: Using SQL (Recommended)**

```bash
# Connect to Supabase
supabase db reset  # Optional: reset database

# Run test setup
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f apps/api/requests/test-setup.sql
```

**Option B: Manual SQL in Supabase Dashboard**

1. Go to http://127.0.0.1:54323 (Supabase Studio)
2. Click "SQL Editor"
3. Copy content from `test-setup.sql`
4. Replace `'a0596c99-9f33-4394-a7cd-b2339601c1ce'` with your org ID
5. Run the query
6. **Copy the customer IDs** from results

**Update Request Files:**
- Open `features.http` → Update `@customerId`
- Open `subscriptions.http` → Update `@customerId`

---

### Step 2: Create Features

Open `features.http` and run these requests **in order**:

```http
1. Create Feature - API Calls Limit (Request #1)
   → Copy the returned "id" as @featureApiCalls

2. Create Feature - Premium Support (Request #2)
   → Copy the returned "id" as @featurePremiumSupport

3. Create Feature - Projects Limit (Request #3)
   → Copy the returned "id" as @featureProjectsLimit

4. Create Feature - Team Members (Request #4)
   → Copy the returned "id" as @featureTeamMembers

5. Create Feature - Custom Domain (Request #5)
   → Copy the returned "id" as @featureCustomDomain

6. List All Features (Request #6)
   → Verify all 5 features were created
```

**Update Feature IDs in `products.http`:**
```http
@featureApiCalls = <paste-id-here>
@featurePremiumSupport = <paste-id-here>
@featureProjectsLimit = <paste-id-here>
@featureTeamMembers = <paste-id-here>
@featureCustomDomain = <paste-id-here>
```

---

### Step 3: Create Products

Open `products.http` and run:

```http
1. Create Product - Free Plan (Request #1)
   → Copy product "id" and first price "id"

2. Create Product - Starter Plan (Request #2)
   → Copy product "id" and first price "id"

3. Create Product - Pro Plan (Request #3)
   → Copy product "id" and both price "ids" (monthly & yearly)

4. List Products with Details (Request #6)
   → Verify all products with features and prices
```

**Update Product/Price IDs in `subscriptions.http`:**
```http
@productIdStarter = <paste-starter-product-id>
@productIdPro = <paste-pro-product-id>
@priceIdStarterMonthly = <paste-starter-price-id>
@priceIdProMonthly = <paste-pro-monthly-price-id>
@priceIdProYearly = <paste-pro-yearly-price-id>
```

---

### Step 4: Create Subscriptions

Open `subscriptions.http` and run:

```http
1. Create Subscription - Starter Plan (Request #1)
   → Creates subscription with 14-day trial
   → Auto-grants features to customer
   → Copy subscription "id"

Expected Response:
{
  "id": "...",
  "status": "trialing",
  "trial_start": "...",
  "trial_end": "...",
  "granted_features": [
    {
      "feature_id": "...",
      "name": "api_calls_limit",
      "properties": { "limit": 1000 }
    },
    ...
  ]
}

2. Get Subscription (Request #4)
   → Verify subscription details

3. List Subscriptions (Request #5)
   → See all subscriptions for your org
```

**Update Subscription ID:**
```http
@subscriptionId = <paste-subscription-id>
```

---

### Step 5: Test Feature Access & Usage

Open `features.http`:

```http
1. Check Feature Access (Request #10)
   → Should return has_access: true
   → Shows limit: 1000, consumed: 0, remaining: 1000

2. Track Usage - First Call (Request #12)
   → Tracks 1 unit
   → Returns consumed: 1, remaining: 999

3. Check Feature Access Again (Request #10)
   → Should show consumed: 1, remaining: 999

4. Track Usage - Multiple Units (Request #13)
   → Tracks 10 units
   → Returns consumed: 11, remaining: 989
```

---

### Step 6: Test Cancellation

Open `subscriptions.http`:

```http
1. Cancel at Period End (Request #7)
   → Sets cancel_at_period_end: true
   → Features remain active until period ends

2. OR Cancel Immediately (Request #8)
   → Sets status: "canceled"
   → Revokes all features immediately

3. Check Feature Access (features.http #10)
   → Should return has_access: false (if canceled immediately)
   → Should still work (if cancel at period end)
```

---

## 📊 Dummy Data Reference

### Test Customers (from test-setup.sql)

```javascript
{
  email: "john.doe@example.com",
  name: "John Doe",
  // For Starter Plan testing
}

{
  email: "jane.smith@example.com",
  name: "Jane Smith",
  // For Pro Plan testing
}

{
  email: "billing@acme.corp",
  name: "Acme Corporation",
  // For Enterprise testing
}
```

### Features

| Feature Name | Type | Default Limit | Used In |
|--------------|------|---------------|---------|
| `api_calls_limit` | usage_quota | 1000 calls/month | All plans |
| `premium_support` | boolean_flag | - | Pro, Enterprise |
| `projects_limit` | numeric_limit | 10 projects | All plans |
| `team_members` | numeric_limit | 5 members | Starter, Pro |
| `custom_domain` | boolean_flag | - | Pro, Enterprise |

### Products

| Plan | Price (Monthly) | Price (Yearly) | Trial | API Calls | Projects | Team | Support | Custom Domain |
|------|-----------------|----------------|-------|-----------|----------|------|---------|---------------|
| Free | $0 | - | 0 days | 100 | 1 | - | ❌ | ❌ |
| Starter | $19 | - | 14 days | 1,000 | 10 | 3 | ❌ | ❌ |
| Pro | $49 | $490 | 14 days | 10,000 | 50 | 10 | ✅ | ✅ |
| Enterprise | $299 | - | 30 days | 100,000 | 999 | 100 | ✅ | ✅ |

### Feature Overrides (Config)

```javascript
// Free Plan
{
  "api_calls_limit": { "limit": 100 },    // Override: 100 (default: 1000)
  "projects_limit": { "limit": 1 }         // Override: 1 (default: 10)
}

// Starter Plan
{
  "api_calls_limit": { "limit": 1000 },   // Use default
  "projects_limit": { "limit": 10 },      // Use default
  "team_members": { "limit": 3 }          // Override: 3 (default: 5)
}

// Pro Plan
{
  "api_calls_limit": { "limit": 10000 },  // Override: 10,000
  "projects_limit": { "limit": 50 },      // Override: 50
  "team_members": { "limit": 10 }         // Override: 10
}
```

---

## 🐛 Common Issues

### Issue 1: "401 Unauthorized"

**Cause:** Auth token expired (tokens last 1 hour)

**Fix:**
1. Check terminal for new token: `🔑 AUTH TOKEN: ...`
2. Update all `.http` files with new token
3. Or refresh frontend and check terminal again

---

### Issue 2: "404 Customer not found"

**Cause:** Customer doesn't exist in database

**Fix:**
1. Run `test-setup.sql` to create customers
2. Copy customer ID from SQL output
3. Update `@customerId` in `.http` files

---

### Issue 3: "404 Feature not found"

**Cause:** Feature IDs in `products.http` don't match actual features

**Fix:**
1. Run `features.http` requests #1-5 to create features
2. Copy feature IDs from responses
3. Update variables at top of `products.http`:
   ```http
   @featureApiCalls = <actual-id>
   @featurePremiumSupport = <actual-id>
   ...
   ```

---

### Issue 4: "404 Price not found"

**Cause:** Price ID doesn't belong to the product

**Fix:**
1. List products: `products.http` request #6
2. Find the product and its price IDs
3. Make sure `price_id` matches `product_id` in subscription request

---

### Issue 5: "400 Quota exceeded"

**Cause:** You've consumed all available units

**Fix:**
This is expected behavior! You're testing the quota system.
1. Check usage: `features.http` request #10
2. Cancel subscription: `subscriptions.http` request #8
3. Create new subscription to reset quota

---

### Issue 6: Variables not resolving ({{baseUrl}} shows as literal)

**Cause:** Variables defined but not being picked up by REST Client

**Fix:**
1. Make sure you have REST Client extension installed
2. Reload VS Code window (Cmd+Shift+P → "Reload Window")
3. Check that variables are defined at top of file (not inside comments)

---

## 🎯 Test Scenarios

### Scenario 1: Complete Subscription Flow

```
1. Create customer (SQL)
2. Create features (features.http #1-5)
3. Create product with features (products.http #2)
4. Create subscription (subscriptions.http #1)
5. Check feature access (features.http #10) → has_access: true
6. Track usage (features.http #12)
7. Check again (features.http #10) → see updated usage
8. Cancel subscription (subscriptions.http #8)
9. Check again (features.http #10) → has_access: false
```

### Scenario 2: Usage Quota Enforcement

```
1. Create subscription to Free Plan (100 API calls)
2. Track 99 units (features.http #12 with units: 99)
3. Check remaining (features.http #10) → remaining: 1
4. Try to track 2 units → Should return 400 quota_exceeded
5. Track exactly 1 unit → Should succeed, remaining: 0
6. Try any more → Should return 400 quota_exceeded
```

### Scenario 3: Plan Upgrade

```
1. Create Starter subscription (1,000 calls)
2. Check limit (features.http #10) → limit: 1000
3. Cancel Starter (subscriptions.http #8)
4. Create Pro subscription (10,000 calls)
5. Check limit again (features.http #10) → limit: 10000
6. Usage resets to 0 on new subscription
```

---

## 📝 Tips

1. **Keep IDs organized**: Create a separate text file to track all IDs as you create resources
2. **Use unique emails**: When creating multiple customers, use unique emails
3. **Check Stripe Dashboard**: If using real Stripe keys, verify subscriptions in Stripe Dashboard
4. **Database queries**: Use queries in `test-setup.sql` to verify data directly
5. **Cleanup**: Use the cleanup queries at bottom of `test-setup.sql` to reset data

---

## 🔗 Related Documentation

- Main test data spec: `/docs/subscriptions/test-data.md`
- API implementation: `/apps/api/src/subscriptions/`
- Database schema: `/supabase/migrations/`

---

**Last Updated:** January 9, 2026
**Status:** Ready for testing
