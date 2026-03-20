---
globs: apps/api/**
---

# Backend Rules (NestJS)

## Module Organization

The API is organized into feature modules under `apps/api/src/`:

- **Auth**: `auth/` — JWT strategy (Supabase tokens), guards, `@CurrentUser()` decorator
- **Core entities**: `user/`, `organization/`, `customers/`
- **Billing**: `products/`, `features/`, `subscriptions/`, `checkout/`, `discounts/`
- **Payments**: `stripe/` (webhooks + Stripe API), `account/` (Stripe Connect)
- **SDK support**: `api-keys/`, `session-tokens/`, `v1/` (public API for SDK)
- **Infrastructure**: `supabase/` (DB client), `redis/`, `sandbox/`, `analytics/`, `config/`

## Authentication

Three auth mechanisms — use the right guard:

| Guard | Use case | Token source |
|-------|----------|-------------|
| `JwtAuthGuard` | Dashboard API calls | Supabase JWT in `Authorization` header |
| `SessionTokenAuthGuard` | SDK/embed endpoints (`/v1/*`) | `bos_session_*` token |
| `ApiKeyAuthGuard` | Server-to-server SDK calls | `sk_test_*` / `sk_live_*` API key |

Extract the authenticated user with `@CurrentUser() user: User` on any guarded endpoint.

## Database Access

- Use `SupabaseService` to get a Supabase client — never instantiate clients directly
- Service-role client for privileged operations (bypasses RLS)
- Always scope queries by `organization_id` to prevent cross-tenant data leaks

## DTOs & Validation

- All input DTOs use `class-validator` decorators
- `class-transformer` for type coercion
- Global `ValidationPipe` is enabled in `main.ts` — no need to add per-endpoint

## Error Handling

- Use NestJS built-in exceptions: `NotFoundException`, `BadRequestException`, `ForbiddenException`
- Stripe errors should be caught and re-thrown as appropriate HTTP exceptions
- Never expose internal error details to clients

## Stripe Integration

- Webhooks at `/stripe/webhooks` — requires raw body (configured in `main.ts`)
- Stripe Connect uses Express accounts for simplified onboarding
- All Stripe operations go through `StripeService` — never call Stripe SDK directly from controllers

## Product Versioning

Products auto-version when changes affect active subscriptions:
- Old version → `version_status: "superseded"`
- New version → `version_status: "current"`
- Prices and features are copied to the new version
- Use the `createPriceRecord` helper for consistent price creation

## Sandbox Mode

- `NODE_ENV=sandbox` activates sandbox behavior
- Sandbox auto-creates Stripe Connect accounts with test bypass values
- Session tokens prefixed `bos_session_test_` route to sandbox API
- `SUPABASE_AUTH_URL` must point to production Supabase for JWT validation in sandbox

## Testing

```bash
cd apps/api
pnpm test                    # All tests
pnpm test:watch              # Watch mode
pnpm test:cov                # Coverage
pnpm test <file>.spec.ts     # Single file
```

## Hard Security Rules

- Every DB query on tenant data MUST include `organization_id` in the WHERE clause — no exceptions. Cross-tenant data leaks are the highest-severity bug.
- Never return raw internal error messages or stack traces to clients. Catch errors and re-throw as NestJS built-in exceptions (`BadRequestException`, `NotFoundException`, `ForbiddenException`).
- Never import or call the Stripe SDK directly outside `StripeService`. All Stripe operations go through `StripeService` methods.
- All controller endpoints must accept input via DTO classes with `class-validator` decorators. Never accept raw `@Body()` without a typed, validated DTO.

## Stripe Sync Rules

- **Stripe is authoritative** for shared entities: products, prices, subscriptions, invoices, payment methods, customers, accounts. If BOS and Stripe disagree, Stripe wins.
- **BOS is authoritative ONLY** for BOS-only systems: usage/metering, feature grants (cache), session tokens, API keys, analytics, portal/checkout sessions.
- When writing to Stripe succeeds → update BOS with Stripe's response data (IDs, timestamps, state). Never use local values when Stripe returns the canonical ones.
- When writing to Stripe fails → do NOT proceed as if it succeeded. Roll back the BOS operation or mark it as failed. Never leave BOS in a state that assumes a Stripe write worked.
- Webhooks are the reconciliation mechanism — they keep BOS in sync with Stripe's reality. Never skip webhook processing for events you handle.
- Usage/metering is BOS-only — NEVER create Stripe API calls for usage tracking or metering.
- Feature access checks query BOS only (`feature_grants` table) — NEVER call Stripe to check feature access. BOS caches entitlement state from webhooks.
- All sync operations must log to `stripe_sync_events` table for audit.
- Webhook idempotency is dual-layer: Redis with 5-min TTL (primary) + `webhook_events` DB table (audit). Both layers must be maintained.
- All Stripe Connect calls MUST include the `stripeAccount` param. Resolution path: `organization_id` → `organizations.account_id` → `accounts.stripe_id`.

## Architecture Rules

- Business logic belongs in services, not controllers. Controllers handle HTTP concerns (request/response, guards, DTOs); services handle domain logic.
- Never add body parsing middleware before the Stripe webhook route (`/stripe/webhooks`). Raw body is required for signature verification — `main.ts` conditionally skips JSON parsing for this route.
- Always regenerate shared types after database migrations: `supabase gen types typescript --local > packages/shared/types/database.ts`.
- SDK endpoints (`/v1/*`) must use `SessionTokenAuthGuard`. Dashboard endpoints use `JwtAuthGuard`. Server-to-server endpoints use `ApiKeyAuthGuard`.
- Feature access checks never call the Stripe API — they query `feature_grants` in BOS, which is kept in sync by webhooks.
