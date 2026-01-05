# Quick Reference: Database Tables & Their Purpose

## The 4 Core Tables

### 1. `users` - Individual People
**Who:** People using the platform
**Key Info:** email, avatar, stripe_customer_id (for purchases)
**Links To:** auth.users (Supabase), organizations (many-to-many)

```
Example: john@example.com
```

---

### 2. `organizations` - Businesses/Teams
**Who:** Companies that accept payments
**Key Info:** name, slug, status, account_id (→ accounts table)
**Links To:** users (many-to-many), accounts (one-to-one)

```
Example:
  name: "Acme Corp"
  slug: "acme-corp"
  account_id: uuid-of-stripe-account
```

---

### 3. `accounts` - Stripe Connect Accounts
**Who:** Payment processor accounts
**Key Info:** stripe_id, is_charges_enabled, is_payouts_enabled
**Links To:** organizations (owned by one org)

```
Example:
  stripe_id: "acct_1234567890"
  is_charges_enabled: true
  is_payouts_enabled: true
```

---

### 4. `user_organizations` - Team Memberships
**Who:** Junction table (many-to-many)
**Key Info:** user_id, organization_id
**Purpose:** Links users to their organizations

```
Example:
  user_id: john-uuid
  organization_id: acme-corp-uuid
  (John is a member of Acme Corp)
```

---

## The Connection Flow

```
User signs up
    ↓
Creates organization
    ↓
Submits business details
    ↓
Creates Stripe account → accounts.stripe_id
    ↓
Completes Stripe onboarding
    ↓
organization.status = 'active'
```

---

## Two Important IDs

### `users.stripe_customer_id`
**Purpose:** When user BUYS something from a merchant
**Example:** User purchases a subscription from Acme Corp
**Stripe Object:** Customer (`cus_xxx`)

### `accounts.stripe_id`
**Purpose:** Merchant's Connect account (RECEIVES money)
**Example:** Acme Corp receives payments from customers
**Stripe Object:** Connected Account (`acct_xxx`)

---

## Why Two Tables: organizations vs accounts?

**organizations:**
- Business entity in your app
- Has name, slug, settings, members
- Exists BEFORE Stripe setup

**accounts:**
- Stripe-specific payment processing
- Created ON-DEMAND when org sets up payments
- One org can have zero or one account (nullable `organization.account_id`)

---

## Common Mistake Fixed

### WRONG: Get account by organization ID using account endpoint
```typescript
GET /accounts/270eed99-80c3-4fab-a10d-a022d8abde17
// 404 - this is an organization ID, not account ID!
```

### RIGHT: Use the organization-specific endpoint
```typescript
GET /accounts/organization/270eed99-80c3-4fab-a10d-a022d8abde17
// ✅ Returns account linked to this organization (or null)
```

---

## Frontend Hook Cheat Sheet

```typescript
// Get current organization (from context)
const { organization } = useOrganization();

// Get organization details
const { data: org } = useOrganization(orgId);

// Get account for organization (NEW - fixed)
const { data: account } = useAccountByOrganization(organization.id);

// Get payment status
const { data: status } = usePaymentStatus(organization.id);

// Submit business details
const submit = useSubmitBusinessDetails(organization.id);

// Create Stripe account
const create = useCreateAccount();
```

---

## Status Values

### organization.status
- `created` - Just created, no Stripe setup
- `onboarding_started` - Business details submitted, Stripe account created
- `active` - Fully onboarded, can accept payments
- `blocked` - Disabled by admin or Stripe

### account.status
Mirrors organization.status

---

## Files to Check for Debugging

### Backend Issues
- `apps/api/src/organization/organization.service.ts` - Organization logic
- `apps/api/src/account/account.service.ts` - Account logic
- `apps/api/src/stripe/stripe.controller.ts` - Webhook handlers

### Frontend Issues
- `apps/web/src/hooks/queries/organization.ts` - Organization queries
- `apps/web/src/hooks/queries/account.ts` - Account queries
- `apps/web/src/app/dashboard/[organization]/(header)/finance/account/page.tsx` - Stripe setup UI

### Database
- `supabase/migrations/` - All schema definitions
- `docs/DATABASE_ARCHITECTURE.md` - Full documentation (this file's big brother)
