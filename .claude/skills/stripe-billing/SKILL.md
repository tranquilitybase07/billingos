# Stripe Billing Skill

This skill covers the BOS-Stripe data boundary, sync patterns, webhook handling, and Stripe Connect integration. Reference this when working on any billing, subscription, product, or payment-related code.

## Data Boundary Table

| Entity | BOS DB | Stripe | Authoritative Source | Sync Direction |
|--------|--------|--------|---------------------|----------------|
| Products | `products` | Products API | **Stripe** (shared) | BOS→Stripe on create/update; Stripe→BOS via webhooks |
| Prices | `product_prices` | Prices API | **Stripe** (shared) | BOS→Stripe on create; archive via Stripe |
| Features | `features` | Entitlements API | **Stripe** (shared) | BOS→Stripe on create; Stripe→BOS via entitlement webhooks |
| Feature Grants | `feature_grants` | Active Entitlements | **Stripe** (shared) | Stripe→BOS via `entitlements.active_entitlement.*` webhooks |
| Subscriptions | `subscriptions` | Subscriptions API | **Stripe** (shared) | BOS→Stripe on create/cancel; Stripe→BOS via webhooks |
| Invoices | — (fetched live) | Invoices API | **Stripe** (shared) | Stripe→BOS (read-only from Stripe) |
| Payment Methods | — (fetched live) | PaymentMethods API | **Stripe** (shared) | Stripe→BOS (read-only from Stripe) |
| Customers | `customers` | Customers API | **Stripe** (shared) | BOS→Stripe on create; synced via webhooks |
| Accounts (Connect) | `accounts` | Accounts API | **Stripe** (shared) | BOS→Stripe on create; Stripe→BOS via `account.updated` |
| Coupons/Discounts | `discounts` | Coupons/Promotions | **Stripe** (shared) | BOS→Stripe on create/update |
| Usage/Metering | `usage_records` | — | **BOS only** | Never touches Stripe |
| Feature Access Checks | `feature_grants` | — | **BOS only** | Query BOS only, never call Stripe |
| Session Tokens | `session_tokens` | — | **BOS only** | BOS-only system |
| API Keys | `api_keys` | — | **BOS only** | BOS-only system |
| Analytics | `analytics_*` | — | **BOS only** | BOS-only system |
| Checkout Sessions | `checkout_sessions` | PaymentIntents | **Stripe** (payment state) | BOS→Stripe on create; Stripe→BOS via webhooks |
| Portal Sessions | `portal_sessions` | — | **BOS only** | BOS-only system |
| Webhook Events | `webhook_events` | — | **BOS only** | Audit/idempotency trail |
| Sync Events | `stripe_sync_events` | — | **BOS only** | Audit trail for all sync operations |

## BOS-Only Systems — NEVER Touch Stripe

These systems exist entirely in BOS. Never create Stripe API calls for them:

- **Usage/Metering**: `usage_records` table tracks consumption per feature per billing period. Initialized on subscription creation, reset on renewal via `handleRenewal()`.
- **Feature Access Checks**: Query `feature_grants` table in BOS. BOS caches entitlement state from Stripe webhooks — never call Stripe to check access.
- **Session Tokens**: HMAC-signed tokens for SDK/embed auth. Format: `bos_session_{env}_{payload}.{signature}`.
- **API Keys**: `sk_test_*` / `sk_live_*` for server-to-server SDK calls.
- **Analytics**: Dashboard analytics, conversion funnels, revenue metrics — all BOS-internal.
- **Portal/Checkout Sessions**: Session management is BOS-only; Stripe handles payment state separately.

## Sync Patterns

### BOS → Stripe (on create/update)

When BOS creates or updates a shared entity:
1. Call the appropriate `StripeService` method
2. **On success**: Update BOS record with Stripe's response (IDs, timestamps, state)
3. **On failure**: Do NOT proceed as if it succeeded. Roll back or mark as failed.
4. Log to `stripe_sync_events` table

Examples:
- `ProductsService.create()`: Creates Stripe product + prices → stores `stripe_product_id`, `stripe_price_id`
- `FeaturesService.create()`: Creates Stripe Entitlement Feature → stores `stripe_feature_id`, sets `stripe_sync_status: 'synced'`
- `SubscriptionsService.create()`: Creates Stripe subscription → stores `stripe_subscription_id`, status from Stripe
- FREE prices/products skip Stripe creation (no `stripe_price_id`)

### Stripe → BOS (webhooks as reconciliation)

Webhooks keep BOS in sync with Stripe's reality. Key handlers:

| Event | Action |
|-------|--------|
| `customer.subscription.created/updated/deleted` | Sync status, period dates; fresh-fetch from Stripe to avoid race conditions; revoke features on terminal states |
| `invoice.payment_succeeded` | Set subscription to `active`; re-grant features if recovering from `past_due` |
| `invoice.payment_failed` | Set subscription to `past_due`; enqueue reconciliation |
| `entitlements.active_entitlement.created/updated/deleted` | Sync to `feature_grants` with `stripe_active_entitlement_id` |
| `account.updated` | Sync `is_details_submitted`, `is_charges_enabled`, `is_payouts_enabled`; update org status |
| `customer.created/updated/deleted` | Sync customer records |

## Stripe Connect

ALL merchant Stripe calls require the `stripeAccount` parameter. Resolution path:

```
organization_id → organizations.account_id → accounts.stripe_id → stripeAccount param
```

Every `StripeService` method that operates on merchant data accepts `stripeAccountId` as a parameter. This routes the call through Stripe Connect to the merchant's Express account.

**Sandbox auto-verification**: In `NODE_ENV=sandbox`, `createConnectAccountSmart()` auto-verifies accounts using Stripe magic test values:
- DOB: `1901-01-01`
- Address: `address_full_match`
- SSN: `0000`

## Webhook Handling

### Raw Body Requirement
`main.ts` conditionally skips JSON body parsing for `/stripe/webhooks`. The raw body is required for `constructWebhookEvent()` signature verification. **Never add body parsing middleware before the webhook route.**

### Dual-Layer Idempotency
1. **Redis** (primary): Set key `stripe:webhook:{livemode}:{eventId}` with 5-minute TTL. If key exists, event is duplicate.
2. **Database** (audit): `webhook_events` table stores all events with status (`pending`/`processed`/`failed`) and retry count.

### Event Processing
- Events are stored in `webhook_events` before processing
- Failed events throw (500) so Stripe retries them
- `stripe_sync_events` logs all sync operations for audit

## Product Versioning

When a product is updated and has active subscriptions, AND changes affect pricing/features/trial:

1. Detect changes: prices added/removed, features added/removed/reconfigured, trial period changes
2. Old version → `version_status: "superseded"`
3. New version → `version_status: "current"` with copied prices and features
4. Existing subscriptions remain on old version
5. New subscriptions use current version

## Key File Paths

| File | Purpose |
|------|---------|
| `apps/api/src/stripe/stripe.service.ts` | All Stripe SDK calls (1185 lines). Products, prices, subscriptions, entitlements, coupons, Connect accounts. |
| `apps/api/src/stripe/stripe-webhook.service.ts` | Webhook event handlers (1100+ lines). Idempotency, event routing, sync logic. |
| `apps/api/src/products/products.service.ts` | Product lifecycle, versioning, Stripe sync, feature attachment (600+ lines). |
| `apps/api/src/features/features.service.ts` | Feature CRUD, Stripe Entitlements sync, sync status tracking (300+ lines). |
| `apps/api/src/subscriptions/subscriptions.service.ts` | Subscription lifecycle, feature grants/revocation, usage records (600+ lines). |
| `apps/api/src/stripe/stripe-webhook.controller.ts` | Webhook endpoint, raw body handling. |
| `apps/api/src/main.ts` | Bootstrap config: raw body middleware skip, global pipes, CORS. |

## Debugging Checklist

### Sync Failures
- Check `stripe_sync_events` for failed operations
- Verify `stripe_sync_status` on features table (`pending`/`synced`/`failed`)
- Check if Stripe product/price IDs are populated in BOS records
- For features: verify `stripe_feature_id` is set after creation

### Webhook Rejections
- Verify raw body middleware is not being intercepted (check `main.ts` ordering)
- Check webhook signing secret matches the Stripe dashboard config
- Check `webhook_events` table for status and error messages
- Verify Redis is running (fallback to DB-only idempotency if down)

### Duplicate Processing
- Check Redis key `stripe:webhook:{livemode}:{eventId}` (5-min TTL)
- Check `webhook_events` table for duplicate event IDs
- Subscription webhooks fresh-fetch from Stripe to prevent race conditions

### Connect Errors
- Verify `stripeAccount` param is being passed (resolution: `org → account → stripe_id`)
- Check account status: `is_charges_enabled`, `is_details_submitted`
- In sandbox: verify auto-creation ran (`auto_created` flag on accounts table)
- Check for `account.application.deauthorized` events (merchant disconnected)

### Product Versioning Issues
- Check `version_status` field: `current` vs `superseded`
- Verify `version_group_id` links versions together
- Existing subscriptions should reference the old version ID
- New subscriptions should use the `current` version
