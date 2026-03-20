# Stripe Migration System — Design Plan

## Problem

BillingOS currently only supports fresh-start onboarding (new Express Connect accounts). Merchants who already have products, prices, customers, and subscriptions in their existing Stripe account have no way to bring that data into BillingOS. This is a blocker for adoption by established businesses.

## Solution Summary

Allow merchants to connect their **existing Stripe account** to BillingOS via Stripe OAuth (Standard connected account), then import their Stripe data as local BillingOS records. All future operations work through the same `stripeAccount` API pattern already in use.

---

## Architecture Decisions

### 1. Account Type: Standard via OAuth

**Current state:** BillingOS creates Express accounts (`type: 'express'`).

**Migration path:** Use Stripe Connect OAuth to connect the merchant's existing Stripe account as a **Standard connected account**. Standard accounts:

- Support `application_fee_percent` (same as Express) — **revenue model preserved**
- Use the same `stripeAccount` header for all API calls — **zero changes to existing code**
- Give the merchant full Stripe Dashboard access (they already have it)
- Are the Stripe-recommended approach for connecting existing accounts

**New env var required:** `STRIPE_CLIENT_ID` (from Stripe Connect settings)

### 2. UI Approach: Minimal Self-Service

- **During onboarding:** Step 2 shows two paths: "Set up new Stripe account" (Express, existing flow) or "Connect existing Stripe account" (Standard, OAuth flow)
- **In settings:** "Import from Stripe" option available if the org has no existing products/customers/subscriptions. If org has data, prompt them to create a new org.
- **No wizard/preview** — just connect and import. Show a summary of results after completion.

### 3. Import Scope

| Entity | Imported? | Notes |
|--------|-----------|-------|
| Products | Yes | Active products. Optionally archived products (toggle). |
| Prices | Yes | All prices attached to imported products. |
| Customers | Yes | All customers with email/name/metadata. |
| Subscriptions | Yes | Active + trialing subscriptions. Optionally canceled (toggle). |
| Features | No | BillingOS-specific concept. Merchant adds features manually post-migration. |
| Discounts/Coupons | No | v1 skips this. Can be added later. |

**Toggle:** "Include archived/canceled data" — defaults to OFF (active-only).

### 4. Platform Fees on Migrated Subscriptions

Existing subscriptions are imported **as-is** without `application_fee_percent`. BillingOS only collects fees on **new** subscriptions created through the platform post-migration. This avoids disrupting the merchant's existing customer base and is a natural growth-based revenue model.

### 5. Post-Onboarding Migration (Existing Orgs)

If a merchant already onboarded with an Express account and wants to migrate:
- **Precondition:** Org must have zero products, customers, and subscriptions in BillingOS.
- If org has data, show a message: "This organization already has billing data. Please create a new organization to import from Stripe."
- This prevents data conflicts and avoids complex merge logic.

---

## Technical Design

### OAuth Flow

```
┌─────────────┐     ┌──────────┐     ┌────────┐
│  BillingOS  │     │  Stripe  │     │Merchant│
│  Frontend   │     │  OAuth   │     │        │
└──────┬──────┘     └────┬─────┘     └───┬────┘
       │                 │               │
       │  1. Click "Connect Stripe"      │
       │─────────────────────────────────>│
       │                 │               │
       │  2. Redirect to Stripe OAuth    │
       │────────────────>│               │
       │                 │  3. Merchant authorizes
       │                 │<──────────────│
       │                 │               │
       │  4. Redirect back with auth code│
       │<────────────────│               │
       │                 │               │
       │  5. Exchange code for acct_xxx  │
       │────────────────>│               │
       │                 │               │
       │  6. Start data import           │
       │                 │               │
```

**Frontend:**
1. Generate OAuth URL: `https://connect.stripe.com/oauth/authorize?response_type=code&client_id={STRIPE_CLIENT_ID}&scope=read_write&redirect_uri={CALLBACK_URL}`
2. Redirect merchant to Stripe
3. Handle callback at `/api/stripe/oauth/callback` with authorization code
4. Exchange code for connected account ID (`stripe_user_id`)

**Backend:**
1. `POST /stripe/oauth/callback` — exchange auth code via `stripe.oauth.token()`
2. Create `accounts` record with `stripe_id = stripe_user_id`, `account_type = 'stripe'`, `status = 'active'`
3. Link to organization via `organizations.account_id`
4. Trigger import process

### Import Pipeline

**Order:** Products → Prices → Customers → Subscriptions (follows dependency chain)

```
┌─────────────────────────────────────────────────────────┐
│                    Migration Service                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Import Products                                     │
│     stripe.products.list({active: true/all})            │
│     → INSERT INTO products (stripe_product_id, ...)     │
│                                                         │
│  2. Import Prices                                       │
│     stripe.prices.list({product: prod_xxx})             │
│     → INSERT INTO product_prices (stripe_price_id, ...) │
│                                                         │
│  3. Import Customers                                    │
│     stripe.customers.list() with auto-pagination        │
│     → INSERT INTO customers (stripe_customer_id, ...)   │
│                                                         │
│  4. Import Subscriptions                                │
│     stripe.subscriptions.list({status: 'active'})       │
│     → Match to local product_id, customer_id, price_id  │
│     → INSERT INTO subscriptions (...)                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Database Schema Changes

#### New table: `stripe_migrations`

Tracks migration jobs for idempotency, progress, and auditability.

```sql
CREATE TABLE stripe_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- pending | in_progress | completed | failed | partial
  stripe_account_id VARCHAR(255) NOT NULL,

  -- Import options
  include_archived BOOLEAN NOT NULL DEFAULT false,

  -- Progress counters
  products_imported INTEGER NOT NULL DEFAULT 0,
  prices_imported INTEGER NOT NULL DEFAULT 0,
  customers_imported INTEGER NOT NULL DEFAULT 0,
  subscriptions_imported INTEGER NOT NULL DEFAULT 0,

  products_total INTEGER,
  prices_total INTEGER,
  customers_total INTEGER,
  subscriptions_total INTEGER,

  -- Error tracking
  errors JSONB DEFAULT '[]',
  -- Array of {entity: 'product', stripe_id: 'prod_xxx', error: 'message'}

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_migrations_org ON stripe_migrations(organization_id);
```

#### Modify `accounts` table

Add support for Standard account type tracking:

```sql
ALTER TABLE accounts ADD COLUMN connect_type VARCHAR(20) DEFAULT 'express';
-- Values: 'express' | 'standard'
```

### Backend Module: `apps/api/src/migration/`

```
migration/
├── migration.module.ts
├── migration.controller.ts       # OAuth callback + trigger import + status
├── migration.service.ts          # Core import logic
├── dto/
│   ├── start-migration.dto.ts    # { organization_id, include_archived }
│   └── migration-status.dto.ts   # Response DTO
└── entities/
    └── migration.entity.ts       # TypeScript type for stripe_migrations
```

**Controller endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/migration/oauth/url` | JWT | Generate Stripe OAuth URL for org |
| `GET` | `/migration/oauth/callback` | Public | Handle OAuth redirect, exchange code |
| `POST` | `/migration/start` | JWT | Trigger import for connected org |
| `GET` | `/migration/:id/status` | JWT | Poll migration progress |

**Service methods:**

```typescript
class MigrationService {
  // OAuth
  generateOAuthUrl(organizationId: string): string;
  handleOAuthCallback(code: string, state: string): Promise<Account>;

  // Import pipeline
  startMigration(orgId: string, options: { includeArchived: boolean }): Promise<Migration>;

  // Individual importers (called by startMigration)
  private importProducts(migration: Migration, stripeAccountId: string): Promise<void>;
  private importPrices(migration: Migration, productMap: Map<string, string>): Promise<void>;
  private importCustomers(migration: Migration, stripeAccountId: string): Promise<void>;
  private importSubscriptions(migration: Migration, maps: ImportMaps): Promise<void>;

  // Status
  getMigrationStatus(migrationId: string): Promise<Migration>;
}
```

### Idempotency & Error Handling

- **Products:** Skip if `stripe_product_id` already exists for the org (UNIQUE constraint on `organization_id + stripe_product_id` — need to add this)
- **Prices:** Skip if `stripe_price_id` already exists
- **Customers:** Use existing `upsertCustomer()` which handles conflicts
- **Subscriptions:** Skip if `stripe_subscription_id` already exists for the org (already has UNIQUE constraint)
- **Re-runnable:** If migration fails partway, re-running it skips already-imported records
- **Error tracking:** Individual entity errors logged to `stripe_migrations.errors` JSONB array; migration continues with remaining entities
- **No rollback:** Imported records stay even if later steps fail. Migration marked as `partial` if some entities failed.

### Mapping Logic

When importing subscriptions, we need to map Stripe IDs to local BillingOS IDs:

```typescript
interface ImportMaps {
  // stripe_product_id → billingos product.id
  products: Map<string, string>;
  // stripe_price_id → billingos product_prices.id
  prices: Map<string, string>;
  // stripe_customer_id → billingos customers.id
  customers: Map<string, string>;
}
```

These maps are built during the Products/Prices/Customers import steps and passed to the Subscriptions import step.

### Product Import Details

For each Stripe product:

```typescript
{
  organization_id: orgId,
  stripe_product_id: stripeProduct.id,          // prod_xxx
  name: stripeProduct.name,
  description: stripeProduct.description || null,
  recurring_interval: derived from first price,  // month, year, etc.
  recurring_interval_count: from first price,
  trial_days: 0,                                 // Not available from Stripe product
  visible_in_pricing_table: true,
  version_status: 'current',
  is_archived: !stripeProduct.active,
  metadata: stripeProduct.metadata,
}
```

### Price Import Details

For each Stripe price:

```typescript
{
  product_id: localProductId,                    // from products map
  stripe_price_id: stripePrice.id,               // price_xxx
  amount_type: stripePrice.unit_amount === 0 ? 'FREE' : 'FIXED',
  price_amount: stripePrice.unit_amount,         // cents
  price_currency: stripePrice.currency,
  recurring_interval: stripePrice.recurring?.interval,
  recurring_interval_count: stripePrice.recurring?.interval_count,
  is_archived: !stripePrice.active,
}
```

### Customer Import Details

```typescript
{
  organization_id: orgId,
  stripe_customer_id: stripeCustomer.id,         // cus_xxx
  email: stripeCustomer.email,
  name: stripeCustomer.name,
  metadata: stripeCustomer.metadata,
  billing_address: stripeCustomer.address,
}
```

### Subscription Import Details

```typescript
{
  organization_id: orgId,
  customer_id: localCustomerId,                  // from customers map
  product_id: localProductId,                    // from product map (via price→product)
  price_id: localPriceId,                        // from prices map
  stripe_subscription_id: stripeSub.id,          // sub_xxx
  status: stripeSub.status,                      // active, trialing, etc.
  amount: stripeSub.items.data[0].price.unit_amount,
  currency: stripeSub.items.data[0].price.currency,
  current_period_start: stripeSub.current_period_start,
  current_period_end: stripeSub.current_period_end,
  trial_start: stripeSub.trial_start,
  trial_end: stripeSub.trial_end,
  cancel_at_period_end: stripeSub.cancel_at_period_end,
  metadata: stripeSub.metadata,
}
```

---

## Frontend Changes

### Onboarding Step 2 (Payment Setup)

Add a fork in the UI:

```
┌─────────────────────────────────────────┐
│        Set up payments                   │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  🆕 Set up new Stripe account   │    │
│  │  Create a fresh account          │    │
│  │  managed by BillingOS            │    │
│  └─────────────────────────────────┘    │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  📥 Connect existing Stripe     │    │
│  │  Import your products,           │    │
│  │  customers & subscriptions       │    │
│  └─────────────────────────────────┘    │
│                                          │
└─────────────────────────────────────────┘
```

### Settings Page

Under Organization Settings → Billing:

- If org has no data: Show "Import from Stripe" card with connect button
- If org has data: Show "To import from Stripe, create a new organization"
- If already connected via OAuth: Show "Connected to Stripe account acct_xxx" with migration status

### Migration Status Component

Simple status display after import starts:

```
Importing from Stripe...

Products:    12/12 ✓
Prices:      24/24 ✓
Customers:   156/200 ⏳
Subscriptions: 0/89 ○

[Include archived data] toggle (before starting)
```

---

## Implementation Order

### Phase 1: Backend Foundation
1. Database migration: `stripe_migrations` table + `accounts.connect_type` column
2. Add `STRIPE_CLIENT_ID` to env config
3. Create `migration` NestJS module with OAuth endpoints
4. Implement OAuth flow (generate URL, handle callback, exchange code)

### Phase 2: Import Pipeline
5. Product importer (list from Stripe → insert into products)
6. Price importer (list per product → insert into product_prices)
7. Customer importer (paginated list → upsert into customers)
8. Subscription importer (list active → match to local IDs → insert)
9. Migration orchestrator (runs steps in order, tracks progress)

### Phase 3: Frontend
10. Onboarding fork UI (new vs. connect existing)
11. OAuth redirect handling
12. Settings page migration option
13. Migration status/progress display

### Phase 4: Polish
14. Error handling & retry logic
15. Re-runnable migration (idempotency verification)
16. Webhook handling for Standard accounts (should already work — verify)

---

## Stripe Tools Reference

| Tool | Use |
|------|-----|
| [OAuth for Standard Accounts](https://docs.stripe.com/connect/oauth-standard-accounts) | Connect existing Stripe account |
| `stripe.oauth.token()` | Exchange auth code for connected account ID |
| `stripe.products.list()` | Paginated product listing |
| `stripe.prices.list()` | Paginated price listing |
| `stripe.customers.list()` | Paginated customer listing (auto-pagination) |
| `stripe.subscriptions.list()` | Filtered subscription listing |
| `application_fee_percent` | Works on Standard accounts (same as Express) |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large accounts (10k+ customers) | Paginated imports with progress tracking. Consider background job. |
| Merchant modifies data in Stripe during import | Import is a point-in-time snapshot. Webhooks sync changes after. |
| Products with no recurring prices (one-time) | Skip one-time products in v1 (BillingOS is subscription-focused). |
| Multi-currency prices | Import all prices, BillingOS already stores currency per price. |
| Subscription with multiple items | v1: Only import first line item. Log warning for multi-item subs. |
| OAuth token revocation | Webhook `account.application.deauthorized` already handled. |

---

## Out of Scope (v1)

- Discount/coupon migration
- Feature/entitlement import from Stripe
- Invoice history import
- Payment method migration (not needed — merchant keeps their account)
- Multi-item subscription support
- Bi-directional sync (Stripe Dashboard changes → BillingOS)
  - Note: Webhooks already handle this for events BillingOS listens to
