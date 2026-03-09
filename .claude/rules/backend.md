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
