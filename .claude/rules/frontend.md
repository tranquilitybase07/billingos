---
globs: apps/web/**
---

# Frontend Rules (Next.js)

## App Router Structure

```
app/
├── (auth)/login, signup      # Auth pages (public)
├── dashboard/
│   ├── create/               # Org creation (first-time users)
│   └── [organization]/       # Org-scoped pages (finance, settings, products, etc.)
├── embed/                    # Iframe-rendered pages (portal, checkout)
├── api/                      # API routes
└── test-components/          # Dev-only test pages
```

## Data Fetching

Two API clients — pick the right one:

| Client      | Import             | Use in                             |
| ----------- | ------------------ | ---------------------------------- |
| `apiClient` | `@/lib/api/client` | Client Components (browser)        |
| `apiServer` | `@/lib/api/server` | Server Components / Route Handlers |

Both auto-inject the Supabase auth token. Use TanStack Query hooks (`hooks/queries/`) for client-side fetching with caching.

## Middleware (`src/middleware.ts`)

- Refreshes Supabase session on every request
- Redirects: unauthenticated → `/login`, no org → `/dashboard/create`
- Supabase session logic lives in `src/lib/supabase/middleware.ts`

## UI Components

- Component library in `src/components/ui/` — Radix UI primitives + Tailwind
- Configured via `components.json` for shadcn CLI
- Use existing components before creating new ones

## Dark Theme CSS

The dark theme has two CSS blocks that **must stay in sync**:

- `:root.dark` (specificity 0-2-0) — uses `var(--color-dark-*)` tokens
- `.dark` (specificity 0-1-0) — uses inline OKLCH values

Key variables:

- `--sidebar` (shadcn) and `--sidebar-background` (custom) are **separate** — set both
- Card depth shadow: `.dark [data-slot="card"]` rule is defined after the `.dark` block

## Environment Switching

- `EnvironmentProvider` + `EnvironmentSwitcher` handle sandbox/production toggle
- `getApiUrl()` from `lib/config/environment.ts` resolves the correct API URL
- Orange `TestModeBanner` renders in sandbox mode
