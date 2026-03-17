# Stripe Migration — Progress Tracker

## Status: Implementation Complete (Phase 1–3)

### Phase 1: Backend Foundation
- [x] Database migration: `stripe_migrations` table + `accounts.connect_type` column
  - File: `supabase/migrations/20260317000000_create_stripe_migrations_table.sql`
- [x] Add `STRIPE_CLIENT_ID` to env config (documented in `apps/api/.env` template)
- [x] Create `migration` NestJS module with OAuth endpoints
  - `apps/api/src/migration/migration.module.ts`
  - `apps/api/src/migration/migration.controller.ts`
  - `apps/api/src/migration/migration.service.ts`
  - `apps/api/src/migration/entities/migration.entity.ts`
  - `apps/api/src/migration/dto/start-migration.dto.ts`
  - `apps/api/src/migration/dto/migration-status.dto.ts`
- [x] Implement OAuth flow (generate URL, handle callback, exchange code)
  - `GET /migration/oauth/url` — generates Stripe OAuth URL
  - `POST /migration/oauth/exchange` — exchanges code for connected account (JWT-authenticated)

### Phase 2: Import Pipeline
- [x] Product importer (list from Stripe → insert into products)
- [x] Price importer (list per product → insert into product_prices, skip one-time prices)
- [x] Customer importer (paginated list → upsert into customers)
- [x] Subscription importer (list active+trialing → match to local IDs → insert)
- [x] Migration orchestrator (runs steps in order, tracks progress, handles errors)

### Phase 3: Frontend
- [x] OAuth callback page: `apps/web/src/app/stripe/connect/callback/page.tsx`
  - Receives `code` + `state` (orgId) from Stripe
  - Calls `POST /migration/oauth/exchange` to create the account
  - Redirects to success page
- [x] Success/import page: `apps/web/src/app/stripe/connect/success/page.tsx`
  - Shows import options (active only / all data)
  - Polls migration status while import runs
- [x] Settings page migration option: `apps/web/src/app/dashboard/[organization]/(header)/finance/account/page.tsx`
  - Added "Set up new account" vs "Connect existing account" choice
  - Step 3 shows migration status for Standard accounts
- [x] Migration status/progress display: `apps/web/src/components/Migration/MigrationProgress.tsx`
  - Shows per-entity counters with progress indicators
- [x] Frontend hooks: `apps/web/src/hooks/queries/migration.ts`
  - `useStripeOAuthUrl`, `useExchangeOAuthCode`, `useStartMigration`, `useMigrationStatus`, `useLatestMigration`

### Phase 4: Polish
- [ ] Error handling & retry logic
- [ ] Idempotency verification
- [ ] Webhook handling for Standard accounts verification

## Notes
- `stripe_migrations` table not yet in generated Supabase types — run migration and regenerate types when deploying
- Add `STRIPE_CLIENT_ID=ca_...` to `apps/api/.env` before using OAuth flow
- One-time (non-recurring) prices are skipped by design
- Multi-item subscriptions: only first line item imported (logged as warning)
