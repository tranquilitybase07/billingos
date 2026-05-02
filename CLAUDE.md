# CLAUDE.md

## Project Overview

BillingOS is a billing and subscription management platform. It provides multi-tenant billing with Stripe Connect, checkout flows, feature gating, usage metering, and a developer SDK.

**Stack:** Next.js 16 (App Router) · React 19 · NestJS · TypeScript · PostgreSQL (Supabase) · Stripe · TailwindCSS 4 · Radix UI · TanStack Query · pnpm monorepo

## Repository Structure

```
apps/
├── web/              Next.js frontend (App Router)
└── api/              NestJS backend
packages/
└── shared/           Shared TypeScript types (Supabase-generated)
supabase/
└── migrations/       Database migrations
docs/
└── [feature]/        Feature documentation (plan.md, progress.md, final.md)
```

## Development Setup

### Prerequisites

- Node.js 20+, pnpm, Docker (for Supabase), Stripe CLI (for webhooks)

### Start Everything

```bash
supabase start          # Must run first — starts local Postgres + Auth
pnpm dev                # Starts both web (3000) and api (3001)
```

Individual apps: `pnpm dev:web` or `pnpm dev:api`

### Database

```bash
supabase migration new <name>                                      # Create migration
supabase gen types typescript --local > packages/shared/types/database.ts  # Regen types after schema changes
```

### Build & Lint

```bash
pnpm build              # Build all
pnpm build:web          # Frontend only
pnpm build:api          # Backend only
pnpm lint               # Lint all workspaces
pnpm clean              # Remove node_modules, .next, dist
```

### Redis

Redis is used for caching analytics data. Install via `brew install redis` and start with `redis-server` or `brew services start redis`. The app falls back gracefully if Redis is unavailable.

## Architecture

### Backend (`apps/api/`)

NestJS with feature-based modules. All endpoints use guards for auth — see `.claude/rules/backend.md` for details on auth guards, Stripe integration, and module organization.

Key patterns:
- Business logic in services, not controllers
- Database via `SupabaseService` (service-role for privileged ops)
- DTOs with `class-validator` for input validation
- Global `ValidationPipe` enabled

### Frontend (`apps/web/`)

Next.js App Router with Server Components by default. See `.claude/rules/frontend.md` for routing structure, data fetching patterns, and CSS conventions.

Key patterns:
- Two API clients: `apiClient` (browser) and `apiServer` (SSR)
- TanStack Query for client-side data fetching
- Middleware handles auth redirects and session refresh

### Shared Types (`packages/shared/`)

Auto-generated from Supabase schema. Import via `@shared/types`. Regenerate after any migration.

## Ports

| Service | Port |
|---------|------|
| Frontend (Next.js) | 3000 |
| Backend (NestJS) | 3001 |
| Supabase API | 54321 |
| PostgreSQL | 54322 |
| Inbucket (email testing) | 54324 |

## Sandbox Mode

BillingOS supports a sandbox environment for testing:

- **Separate infra**: sandbox-api.billingos.dev + dedicated Supabase project
- **Same codebase**: `NODE_ENV=sandbox` toggles behavior
- **Token routing**: `bos_session_test_` → sandbox API, `bos_session_live_` → production API
- **API keys**: `sk_test_*` → sandbox, `sk_live_*` → production
- **Auto-Stripe**: Sandbox orgs get auto-verified Stripe Connect accounts (no onboarding needed)
- **JWT**: Sandbox backend validates tokens against production Supabase (`SUPABASE_AUTH_URL` env var)

## Key Gotchas

- **Always start Supabase before `pnpm dev`** — auth and DB depend on it
- **Regenerate types after migrations** — `packages/shared/types/database.ts` goes stale
- **Stripe webhooks need raw body** — configured in `main.ts`, don't add body parsing middleware before it
- **Two dark-mode CSS blocks** — `:root.dark` and `.dark` must stay in sync (see frontend rules)
- **`--sidebar` vs `--sidebar-background`** — these are separate CSS vars, set both
- **Product versioning is automatic** — editing products with active subscriptions creates a new version
- **Session tokens are env-prefixed** — `bos_session_test_` vs `bos_session_live_` determines API routing
- **Portal is iframe-based** — SDK embeds portal via iframe, don't convert to inline rendering
- **Sandbox JWT issuer** — sandbox backend must set `SUPABASE_AUTH_URL` to production Supabase URL

## Feature Documentation

For new features, create `docs/[feature-name]/` with:
- `plan.md` — architecture decisions and implementation plan
- `progress.md` — track implementation as you go
- `final.md` — summary, deviations, and maintenance notes

## Related Projects

| Project | Description |
|---------|-------------|
| **BillingOS SDK** | JavaScript/TypeScript SDK for integrating BillingOS (session management, checkout, feature gating) |
| **Test App** | Next.js app for testing SDK integration (pricing tables, portal, checkout) |

## Code Standards

- TypeScript strict — no `any` types
- Validate inputs: `class-validator` (backend), Zod (frontend)
- Keep components small and focused
- Handle errors with user-friendly messages
- Extract common logic into reusable helpers (DRY)
- Use transactions for multi-step database operations
- Write tests for critical backend logic

## Comments

Default: write no comments. Well-named identifiers explain *what*; comments are only for *why* when it isn't obvious from the code.

Only add a comment when it captures something a reader can't see: a hidden constraint, a subtle invariant, a non-obvious tradeoff, or a workaround for specific external behavior (Stripe quirk, browser bug, race condition). If removing the comment wouldn't confuse a future reader, don't write it.

Comments must be **neutral and timeless** — written for any future dev, not narrating the current session.

Bad — restates the code:
```ts
// Increment the counter
counter++;
// Loop through users
for (const user of users) { ... }
```

Bad — session/task narration:
```ts
// Fixed bug where discount wasn't applied
// Added this because the user reported X
// We need to do this because of the issue we just discussed
// TODO: removed old logic per refactor
```

Bad — ghost comments for deleted code:
```ts
// (removed legacy handler)
```

Good — explains a non-obvious *why*:
```ts
// Stripe returns prorated amounts in the smallest currency unit, but
// adaptive pricing checkout sessions report in major units — normalize here.
const amount = isAdaptive ? raw * 100 : raw;

// Must run before JSON middleware: Stripe webhook signature verification
// requires the raw request body.
app.use('/stripe/webhooks', rawBodyParser);
```

Style rules:
- One short line max for inline comments. No multi-paragraph docstrings.
- No references to PRs, issues, tickets, "the bug", "we", "I", "just", "now", "previously", or "this fix".
- No commented-out code — delete it; git remembers.
- No JSDoc on internal functions unless the type signature genuinely needs prose explanation.
