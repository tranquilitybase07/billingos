# BillingOS Database Architecture

## Overview

BillingOS uses a multi-tenant architecture where **organizations** are the core business entities that own payment processing accounts. This document explains how users, organizations, and Stripe Connect accounts are connected.

---

## Core Concepts

### 1. **Users** (`public.users`)
Individual people who use the platform. Each user can belong to **multiple organizations**.

**Key Fields:**
- `id` - UUID (links to `auth.users` from Supabase Auth)
- `email` - User's email address
- `stripe_customer_id` - For when users make purchases (NOT for Connect)
- `avatar_url` - Profile picture
- `is_admin` - Platform admin flag
- `created_at`, `updated_at`, `deleted_at` - Timestamps

**Purpose:**
- Extends Supabase Auth users with app-specific data
- Stores user profile information
- Tracks Stripe Customer ID (when user buys something from a merchant)

**File Reference:** `supabase/migrations/20251230200855_create_users_table.sql`

---

### 2. **Organizations** (`public.organizations`)
Business entities (companies, teams) that use BillingOS to accept payments from their customers.

**Key Fields:**
- `id` - UUID (primary key)
- `name` - Organization display name (e.g., "Acme Corp")
- `slug` - URL-friendly unique identifier (e.g., "acme-corp")
- `email` - Organization contact email
- `account_id` - **Foreign key to `accounts` table** (nullable until Stripe Connect setup)
- `status` - Lifecycle stage: `created` → `onboarding_started` → `active` → `blocked`
- `details` - JSONB storing business details from onboarding
- `details_submitted_at` - When business details were submitted

**Settings (JSONB fields):**
- `profile_settings` - Organization profile configuration
- `subscription_settings` - Billing/subscription preferences
- `notification_settings` - Email/webhook preferences
- `customer_portal_settings` - Customer-facing portal config
- Feature flags and customization options

**Purpose:**
- Represents a business/merchant using BillingOS
- Owns Stripe Connect accounts (via `account_id` foreign key)
- Contains business details needed for Stripe verification
- Tracks onboarding progress and account status

**File Reference:** `supabase/migrations/20251230210100_create_organizations_table.sql`

**Important:** Organizations are multi-tenant. Users can be members of multiple organizations.

---

### 3. **Accounts** (`public.accounts`)
Stripe Connect accounts that handle payments and payouts. Each organization gets **one account**.

**Key Fields:**
- `id` - UUID (primary key)
- `admin_id` - User who created the account
- `stripe_id` - Stripe Connect account ID (e.g., `acct_1234567890`)
- `email` - Email registered with Stripe
- `country` - ISO 2-letter country code (e.g., "US")
- `currency` - Default currency (e.g., "usd")
- `is_details_submitted` - Stripe onboarding form completed?
- `is_charges_enabled` - Can accept payments?
- `is_payouts_enabled` - Can receive bank transfers?
- `status` - Mirrors organization status
- `data` - Raw Stripe account object (JSONB)

**Platform Fees (future use):**
- `platform_fee_percent` - Basis points (500 = 5%)
- `platform_fee_fixed` - Fixed fee in cents

**Purpose:**
- Links to Stripe Connect API (Express Accounts)
- Tracks payment/payout capabilities
- Stores Stripe verification status
- Manages platform revenue split (future)

**File Reference:** `supabase/migrations/20251230210200_create_accounts_table.sql`

---

### 4. **User Organizations** (`public.user_organizations`)
Many-to-many relationship between users and organizations (team membership).

**Key Fields:**
- `user_id` - Foreign key to `users`
- `organization_id` - Foreign key to `organizations`
- `created_at`, `updated_at`, `deleted_at` - Timestamps

**Purpose:**
- Allows users to belong to multiple organizations
- Tracks team membership
- Soft-delete support (keeps history when user leaves)

**File Reference:** `supabase/migrations/20251230210300_create_user_organizations_table.sql`

---

## Relationship Diagram

```
┌─────────────────┐
│   auth.users    │  (Supabase Auth)
│   (built-in)    │
└────────┬────────┘
         │ 1:1
         │ (auto-created on signup)
         ▼
┌─────────────────┐
│  public.users   │
│                 │
│ • email         │
│ • avatar_url    │
│ • stripe_       │
│   customer_id   │
└────────┬────────┘
         │
         │ Many-to-Many
         │ (via user_organizations)
         │
         ▼
┌─────────────────────────────────┐
│   user_organizations            │
│                                 │
│ • user_id ──────────────┐      │
│ • organization_id       │      │
└─────────────┬───────────┴──────┘
              │
              ▼
┌─────────────────────────────────┐
│   public.organizations          │
│                                 │
│ • name                          │
│ • slug (unique)                 │
│ • status                        │
│ • account_id ───────┐           │
│ • details (JSONB)   │           │
└─────────────────────┼───────────┘
                      │ 1:1 (nullable)
                      │
                      ▼
            ┌─────────────────────┐
            │  public.accounts    │
            │                     │
            │ • stripe_id         │
            │ • admin_id          │
            │ • is_details_       │
            │   submitted         │
            │ • is_charges_       │
            │   enabled           │
            │ • is_payouts_       │
            │   enabled           │
            │ • data (JSONB)      │
            └─────────────────────┘
```

---

## Data Flow: User Onboarding Journey

### Step 1: User Signs Up
1. User enters email on `/signup`
2. Supabase Auth sends magic link
3. User clicks link → `auth.users` record created
4. **Trigger fires:** `handle_new_user()` creates `public.users` record
5. Middleware redirects to `/dashboard/create` (no organizations yet)

**Tables Involved:**
- `auth.users` (new record)
- `public.users` (auto-created via trigger)

---

### Step 2: Create Organization
User fills out form at `/dashboard/create`:
- Organization name (e.g., "My Startup")
- Slug is auto-generated (e.g., "my-startup")

**Backend API Call:** `POST /organizations`

**What Happens:**
1. Organization created in `public.organizations`:
   ```sql
   INSERT INTO organizations (name, slug, status)
   VALUES ('My Startup', 'my-startup', 'created');
   ```
2. User added to `user_organizations`:
   ```sql
   INSERT INTO user_organizations (user_id, organization_id)
   VALUES ('user-uuid', 'org-uuid');
   ```
3. User redirected to `/dashboard/my-startup`

**Tables Involved:**
- `organizations` (new record)
- `user_organizations` (new membership)

---

### Step 3: Submit Business Details
User goes to `/dashboard/my-startup/finance/account` and submits:
- Business name
- Country
- Product description
- Intended use

**Backend API Call:** `POST /organizations/:id/business-details`

**What Happens:**
1. Organization updated:
   ```sql
   UPDATE organizations
   SET details = '{"business_name": "...", "country": "US", ...}'::jsonb,
       details_submitted_at = NOW()
   WHERE id = 'org-uuid';
   ```

**Tables Involved:**
- `organizations` (updated `details` field)

---

### Step 4: Create Stripe Connect Account
User clicks "Create Stripe Account" button.

**Backend API Call:** `POST /accounts`

**What Happens:**
1. **Stripe API call:** Create Express Connect account
   ```javascript
   const stripeAccount = await stripe.accounts.create({
     type: 'express',
     country: 'US',
     email: 'user@example.com',
     capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
   });
   ```
2. **Database:** Create account record
   ```sql
   INSERT INTO accounts (admin_id, stripe_id, country, status, data)
   VALUES ('user-uuid', 'acct_1234...', 'US', 'onboarding_started', '{...}'::jsonb);
   ```
3. **Database:** Link to organization
   ```sql
   UPDATE organizations
   SET account_id = 'account-uuid',
       status = 'onboarding_started'
   WHERE id = 'org-uuid';
   ```

**Tables Involved:**
- `accounts` (new record)
- `organizations` (updated `account_id` and `status`)

**External:** Stripe API creates Connect account

---

### Step 5: Complete Stripe Onboarding
Backend generates Stripe Account Link for user to complete KYC.

**Backend API Call:** `POST /accounts/:id/onboarding-link`

**What Happens:**
1. **Stripe API call:** Create account link
   ```javascript
   const accountLink = await stripe.accountLinks.create({
     account: 'acct_1234...',
     refresh_url: 'http://localhost:3000/dashboard/my-startup/finance/account',
     return_url: 'http://localhost:3000/dashboard/my-startup/finance/account',
     type: 'account_onboarding'
   });
   ```
2. User redirected to Stripe (external)
3. User fills out forms (identity, bank account, etc.)
4. Stripe sends webhook: `account.updated`

**Backend Webhook Handler:** `POST /stripe/webhooks`

**What Happens:**
1. **Verify webhook signature**
2. **Sync account status:**
   ```sql
   UPDATE accounts
   SET is_details_submitted = true,
       is_charges_enabled = true,
       is_payouts_enabled = true,
       data = '{...stripe account object...}'::jsonb
   WHERE stripe_id = 'acct_1234...';
   ```
3. **Update organization:**
   ```sql
   UPDATE organizations
   SET status = 'active',
       onboarded_at = NOW()
   WHERE account_id = 'account-uuid';
   ```

**Tables Involved:**
- `accounts` (updated capabilities)
- `organizations` (status = `active`)

**External:** Stripe webhook event

---

## Common Query Patterns

### Get All Organizations for a User
```typescript
// Backend: apps/api/src/organization/organization.service.ts
const { data } = await supabase
  .from('user_organizations')
  .select('organization_id, organizations(*)')
  .eq('user_id', userId)
  .is('deleted_at', null);
```

### Get Organization with Account Details
```typescript
// Backend: apps/api/src/organization/organization.service.ts
const { data } = await supabase
  .from('organizations')
  .select('*, accounts(*)')
  .eq('id', organizationId)
  .single();
```

### Get Account by Organization ID
```typescript
// Backend: apps/api/src/account/account.service.ts:185-236
// NEW endpoint added: GET /accounts/organization/:organizationId

1. Verify user is member of organization
2. Fetch organization.account_id
3. Return account details (or null if no account yet)
```

### Check if Organization is Payment-Ready
```typescript
// Backend: apps/api/src/organization/organization.service.ts
const { data: org } = await supabase
  .from('organizations')
  .select('account_id, accounts(is_charges_enabled, is_payouts_enabled)')
  .eq('id', organizationId)
  .single();

const isReady = org.accounts?.is_charges_enabled && org.accounts?.is_payouts_enabled;
```

---

## API Endpoints Reference

### Organizations
- `POST /organizations` - Create new organization
- `GET /organizations` - List user's organizations
- `GET /organizations/:id` - Get organization details
- `PATCH /organizations/:id` - Update organization
- `POST /organizations/:id/business-details` - Submit business details
- `GET /organizations/:id/payment-status` - Check Stripe setup status

### Accounts
- `POST /accounts` - Create Stripe Connect account
- `GET /accounts/:id` - Get account by account ID
- **`GET /accounts/organization/:organizationId`** - **NEW:** Get account by organization ID
- `POST /accounts/:id/onboarding-link` - Generate Stripe onboarding URL
- `POST /accounts/:id/dashboard-link` - Generate Stripe dashboard URL
- `POST /accounts/:id/sync` - Sync account status from Stripe

### Users
- `GET /users/me` - Get current user profile
- `PATCH /users/me` - Update user profile

---

## Frontend Hook Usage

### Get Account for Current Organization
```typescript
// WRONG (old way - was causing 404 error):
const { data: account } = useAccount(organization.id);
// This passes organization ID instead of account ID!

// CORRECT (new way):
const { data: account } = useAccountByOrganization(organization.id);
// This uses the new endpoint: GET /accounts/organization/:organizationId
```

**File:** `apps/web/src/hooks/queries/account.ts:30-37`

---

## Status Flow

### Organization Status
```
created
   ↓
onboarding_started  (after business details submitted & Stripe account created)
   ↓
active  (after Stripe onboarding completed)
   ↓
blocked (if Stripe disables account or admin blocks)
```

### Account Status
Mirrors organization status. Both are synced via webhooks.

---

## Key Takeaways

1. **Organizations are the primary entity** - They own accounts, not users
2. **Users can belong to multiple organizations** - Via `user_organizations` join table
3. **One organization = One Stripe Connect account** - Linked via `organizations.account_id`
4. **Account is nullable** - Organizations exist before Stripe accounts are created
5. **Status syncing** - Stripe webhooks keep `accounts` and `organizations` status in sync
6. **Two types of Stripe IDs:**
   - `users.stripe_customer_id` - For when users buy from merchants
   - `accounts.stripe_id` - For merchant's Connect account (receives payouts)

---

## Debugging Tips

### "Account not found" Error
**Symptom:** `GET /accounts/:id` returns 404

**Cause:** You're passing organization ID instead of account ID

**Fix:** Use `GET /accounts/organization/:organizationId` instead

**Example:**
```typescript
// BEFORE (broken):
const response = await fetch(`/accounts/270eed99-80c3-4fab-a10d-a022d8abde17`);

// AFTER (fixed):
const response = await fetch(`/accounts/organization/270eed99-80c3-4fab-a10d-a022d8abde17`);
```

### "Business details validation error"
**Symptom:** DTO rejects `business_name` and `country` fields

**Cause:** DTO didn't include those fields, only had `about`, `product_description`, `intended_use`

**Fix:** Updated DTO to accept all fields as optional (`@IsOptional()`)

**File:** `apps/api/src/organization/dto/submit-business-details.dto.ts:3-22`

---

## Future Enhancements

### Team Roles
Add `role` column to `user_organizations`:
```sql
ALTER TABLE user_organizations ADD COLUMN role VARCHAR(50) DEFAULT 'member';
-- Roles: owner, admin, member, viewer
```

### Multiple Accounts per Organization
Remove unique constraint on `organizations.account_id`, allow array:
```sql
ALTER TABLE organizations ADD COLUMN account_ids UUID[];
```

### Platform Revenue
Use `accounts.platform_fee_percent` and `platform_fee_fixed` for application fees.

---

## Related Documentation

- **Onboarding Flow:** `docs/onboarding/final.md`
- **Authentication:** `docs/auth/final.md`
- **Frontend Progress:** `FRONTEND_PROGRESS.md`
- **Database Migrations:** `supabase/migrations/`
