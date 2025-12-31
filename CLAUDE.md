# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BillingOS is a full-stack billing and payments platform built as a pnpm monorepo. It provides organization management, Stripe Connect integration for multi-tenant payouts, team collaboration, and payment processing capabilities.

**Vision & Scope:**
BillingOS aims to build a comprehensive billing SDK and subscription management platform with features including:
- Dev SDK (Checkout/Feature Gating/Metering)
- Embedded checkout page (modal/popup)
- Subscription management portal
- Smart dunning & retention flows
- In-app notifications
- Entitlements & feature gating
- Revenue analytics dashboard
- Proactive upgrade nudges

**Reference Architecture:**
This project uses **Polar.sh** (`/Users/ankushkumar/Code/payment/billingos`) as the primary reference for:
- Architecture decisions
- UI/UX design patterns
- Database table structures
- Stripe implementation patterns
- Component organization

**Development Approach:**
1. **Reference Polar first** - Check Polar's implementation before building new features
2. **Copy & adapt** - Most architecture-level code can be directly copied, then simplified
3. **Remove unnecessary features** - Strip out Polar-specific features not needed for BillingOS
4. **Document everything** - Each feature gets its own docs folder with planning, progress, and final output docs

**Tech Stack:**
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, TailwindCSS 4, Radix UI, TanStack Query
- **Backend**: NestJS, TypeScript
- **Database**: PostgreSQL (via Supabase local)
- **Auth**: Supabase Auth (magic links + OAuth)
- **Payments**: Stripe & Stripe Connect
- **Package Manager**: pnpm with workspaces
- **UI Components**: Copied from Polar, pre-configured with shadcn/ui

## Monorepo Structure

```
apps/
├── web/          Next.js frontend (port 3000)
└── api/          NestJS backend (port 3001)
packages/
└── shared/       Shared TypeScript types (Supabase generated)
docs/
├── auth/         Authentication feature documentation
├── onboarding/   User onboarding flow documentation
└── [feature]/    Each feature has its own docs folder
    ├── plan.md       Initial planning document
    ├── progress.md   Implementation progress tracking
    └── final.md      Final implementation notes
```

## Documentation Standards

**For Every New Feature:**
1. Create a dedicated folder in `docs/[feature-name]/`
2. Write three required documents:
   - `plan.md` - Initial planning, architecture decisions, Polar references
   - `progress.md` - Track implementation progress, blockers, changes
   - `final.md` - Final implementation summary, lessons learned, maintenance notes
3. Reference these docs when working on related features
4. Update progress docs as implementation evolves

**Existing Documentation:**
- `FRONTEND_PROGRESS.md` - Frontend implementation roadmap (root level)
- `ONBOARDING_FLOW_WORKING.md` - User onboarding flow details (root level)
- `docs/auth/` - Authentication setup and configuration
- `docs/onboarding/` - Onboarding flow documentation

## Development Commands

### Start Full Development Environment
```bash
# Start both frontend and backend concurrently
pnpm dev

# Or start individually:
pnpm dev:web   # Frontend only (port 3000)
pnpm dev:api   # Backend only (port 3001)
```

### Database & Supabase
```bash
# Start Supabase locally (required for auth & db)
supabase start

# Generate TypeScript types from database schema
supabase gen types typescript --local > packages/shared/types/database.ts

# Stop Supabase
supabase stop
```

### Building
```bash
pnpm build        # Build all apps
pnpm build:web    # Build frontend only
pnpm build:api    # Build backend only
```

### Linting & Testing
```bash
pnpm lint         # Lint all workspaces

# Backend tests (NestJS)
cd apps/api
pnpm test                    # Run all tests
pnpm test:watch              # Watch mode
pnpm test:cov                # Coverage report
pnpm test <file>.spec.ts     # Run single test file
```

### Cleaning
```bash
pnpm clean        # Remove all node_modules, .next, dist
```

## Architecture

### Backend (NestJS - apps/api/)

**Module Structure:**
- `auth/` - JWT strategy, guards, decorators for Supabase auth token validation
- `user/` - User profile management, identity verification
- `organization/` - Organization CRUD, business details, member management
- `account/` - Stripe Connect account creation, onboarding, dashboard links
- `stripe/` - Stripe webhook handling, payment processing
- `supabase/` - Supabase client service (global)

**Key Patterns:**
- All endpoints protected by JWT guard validating Supabase auth tokens
- User context extracted from JWT and injected via `@CurrentUser()` decorator
- Database access through Supabase client (service role for privileged ops)
- DTOs use `class-validator` and `class-transformer`
- Global validation pipe enabled in `main.ts`

**Important Files:**
- `main.ts:36` - Server starts on port 3001, CORS enabled for frontend
- `app.module.ts` - All modules imported here
- `auth/strategies/jwt.strategy.ts` - Validates Supabase JWT tokens
- `supabase/supabase.service.ts` - Global Supabase client

### Frontend (Next.js - apps/web/)

**App Router Structure:**
```
app/
├── (auth)/
│   ├── login/
│   └── signup/
├── dashboard/
│   ├── create/                    # Organization creation (first-time users)
│   └── [organization]/            # Organization-scoped pages
│       ├── finance/account/       # Stripe Connect setup
│       └── settings/members/      # Team management
```

**Key Patterns:**
- Server Components by default, Client Components use 'use client'
- Supabase auth handled via middleware (`src/middleware.ts`)
- TanStack Query for client-side data fetching (`hooks/queries/`)
- API client wrappers: `lib/api/client.ts` (client-side), `lib/api/server.ts` (SSR)
- Auth tokens automatically injected into API calls
- Middleware redirects: unauthenticated → /login, new users → /dashboard/create

**Important Files:**
- `src/middleware.ts` - Auth protection, organization check, redirects
- `src/lib/supabase/middleware.ts` - Supabase session management
- `src/lib/api/client.ts` - Client-side API wrapper with auth
- `src/lib/api/types.ts` - TypeScript types for API responses
- `src/providers/QueryProvider.tsx` - TanStack Query setup

**UI Components:**
- Pre-built components in `src/components/ui/` (Radix UI + Tailwind)
- Configured via `components.json` for shadcn integration

### Shared Types (packages/shared/)

**Database Types:**
- Auto-generated from Supabase schema: `types/database.ts`
- Regenerate after schema changes with `supabase gen types`
- Imported in both apps via workspace protocol: `@shared/types`

### Authentication Flow

1. **Login/Signup**: Magic link sent via Supabase Auth
2. **Middleware Check**: `middleware.ts` validates session
3. **Organization Check**: New users → `/dashboard/create`, existing → `/dashboard`
4. **API Calls**: JWT token from Supabase passed to NestJS backend
5. **Backend Validation**: JWT strategy validates token, extracts user ID

### Database Schema

**Core Tables:**
- `users` - Extended user profiles (links to `auth.users`)
- `organizations` - Company/team entities
- `user_organizations` - Many-to-many with roles (admin/member)
- `accounts` - Stripe Connect accounts (one per organization)

**Key Relationships:**
- User can belong to multiple organizations
- Organization has one primary Stripe Connect account
- Member roles: `admin` (full access) or `member` (limited)

### Environment Variables

**Frontend (.env):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Backend (.env):**
```bash
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
```

## Key Workflows

### Implementing a New Feature (IMPORTANT)

**Always follow this process:**

1. **Research Polar's Implementation**
   - Navigate to `/Users/ankushkumar/Code/payment/billingos` (Polar repo)
   - Study how Polar implements the feature
   - Identify components, API endpoints, database tables, Stripe integration
   - Take notes on architecture decisions

2. **Create Feature Documentation**
   ```bash
   mkdir -p docs/[feature-name]
   touch docs/[feature-name]/plan.md
   touch docs/[feature-name]/progress.md
   touch docs/[feature-name]/final.md
   ```

3. **Write Initial Plan** (`plan.md`)
   - Reference Polar's approach
   - List components/endpoints to copy
   - Identify what to remove/simplify
   - Define database schema changes needed
   - Outline implementation steps

4. **Implement Feature**
   - Copy relevant code from Polar
   - Adapt for BillingOS (NestJS backend instead of Polar's stack)
   - Remove unnecessary features
   - Update `progress.md` as you go

5. **Document Completion** (`final.md`)
   - Summarize what was built
   - Note deviations from Polar
   - Document any gotchas or important decisions
   - Include usage examples

### Creating a New Backend Endpoint

1. **Check Polar** - See how Polar implements similar endpoints
2. Add method to relevant service (e.g., `organization.service.ts`)
3. Create DTO in `dto/` directory with validation decorators
4. Add controller method with guards: `@UseGuards(JwtAuthGuard)`
5. Extract user with `@CurrentUser() user: User`
6. Add corresponding type to `apps/web/src/lib/api/types.ts`
7. Create React Query hook in `apps/web/src/hooks/queries/`

### Adding a Database Migration

```bash
# Create migration file
cd supabase
supabase migration new your_migration_name

# Edit the generated SQL file in supabase/migrations/
# Apply migrations (auto-applied on supabase start)

# Regenerate TypeScript types
supabase gen types typescript --local > ../packages/shared/types/database.ts
```

### Working with Stripe Connect

1. Organization submits business details (`POST /organizations/:id/business-details`)
2. Create Stripe Connect account (`POST /accounts`)
3. Generate onboarding link (`POST /accounts/:id/onboarding-link`)
4. User completes Stripe onboarding flow
5. Backend receives webhook when account is verified
6. Account status updated in database

## Stripe Integration Details

- **Express Accounts**: Simplified onboarding for quick setup
- **Webhooks**: Handled in `apps/api/src/stripe/stripe.controller.ts` at `/stripe/webhooks`
- **Raw Body**: Required for webhook signature verification (configured in `main.ts`)
- **Account Links**: Generated via Stripe API for onboarding and dashboard access
- **Return URLs**: Frontend handles success/failure redirects from Stripe

## Current Implementation Status

**Completed:**
- ✅ Monorepo setup with pnpm workspaces
- ✅ Backend API (auth, users, organizations, accounts, Stripe)
- ✅ Frontend auth flow (signup, login, magic links)
- ✅ Organization creation
- ✅ React Query setup and API client
- ✅ Middleware-based routing and auth protection
- ✅ Database schema with RLS policies
- ✅ Supabase local development setup

**In Progress:**
- 🚧 Organization dashboard layout (`/dashboard/[organization]/page.tsx` needed)
- 🚧 Stripe Connect account setup UI
- 🚧 Team member management UI
- 🚧 Payment processing flows

**Documented In:**
- `FRONTEND_PROGRESS.md` - Frontend implementation roadmap
- `ONBOARDING_FLOW_WORKING.md` - User onboarding flow details
- `docs/auth/` - Authentication setup and configuration
- `docs/onboarding/` - Onboarding flow documentation

**Planned Features** (see image reference for complete list):
- Dev SDK (Checkout/Feature Gating/Metering)
- Checkout page (embedded - modal/popup) with custom branding, multi-plan selection, coupon codes, tax calculation
- Subscription Management Portal (view plan, upgrade/downgrade, update payment, view invoices, cancel subscription, usage tracking)
- Smart Dunning & Retention (automatic retry flow, cancellation flow with surveys and offers)
- In-App Notifications (trial ending, payment failed, usage limit warnings, new invoice, subscription cancelled)
- Entitlements & Feature Gating (server-side SDK for feature checks)
- Revenue Analytics Dashboard (MRR, churn rate, LTV, expansion revenue, cohort analysis, failed payment recovery rate)
- Upgrade Nudges (proactive suggestions at the right moment)

## Common Patterns

### Backend Controller Pattern
```typescript
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationController {
  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateOrganizationDto
  ) {
    return this.organizationService.create(user.id, dto);
  }
}
```

### Frontend API Client Pattern
```typescript
// Client-side
import { apiClient } from '@/lib/api/client';
const org = await apiClient.get<Organization>(`/organizations/${id}`);

// Server-side
import { apiServer } from '@/lib/api/server';
const org = await apiServer.get<Organization>(`/organizations/${id}`);
```

### React Query Hook Pattern
```typescript
export function useOrganization(id: string) {
  return useQuery({
    queryKey: ['organization', id],
    queryFn: () => apiClient.get<Organization>(`/organizations/${id}`),
  });
}
```

## Important Notes

### Port Configuration
- **Port 3000**: Frontend (Next.js)
- **Port 3001**: Backend (NestJS)
- **Port 54321**: Supabase API (local)
- **Port 54322**: PostgreSQL database (local)
- **Port 54324**: Inbucket (local email testing)

### Development Rules
- Always run `supabase start` before `pnpm dev`
- Frontend middleware checks organization membership before rendering pages
- Backend validates all requests with JWT from Supabase
- Database types should be regenerated after schema changes
- Stripe webhooks require raw body parsing (handled in `main.ts`)

### Working with Polar Reference
- **Polar repo location**: `/Users/ankushkumar/Code/payment/billingos`
- **When to reference**: Before implementing ANY new feature
- **What to copy**: Architecture, UI components, API patterns, database schemas, Stripe flows
- **What to adapt**: Backend (Polar uses different stack, BillingOS uses NestJS)
- **What to remove**: Polar-specific features not in BillingOS roadmap

### Documentation is Mandatory
- **Never skip documentation** - Every feature needs `docs/[feature]/plan.md`, `progress.md`, `final.md`
- **Update progress.md live** - Track changes as you implement
- **Reference docs first** - Check existing docs before asking questions
- **Keep docs current** - Update when architecture changes

### Code Quality Standards
- Use TypeScript strictly (no `any` types)
- Follow Polar's component organization patterns
- Validate all inputs with Zod schemas
- Handle errors gracefully with user-friendly messages
- Write tests for critical backend logic (NestJS has Jest configured)
- Keep components small and focused (Polar has good examples)

## Polar Reference Workflow (Critical)

**🎯 Golden Rule: Always reference Polar before building anything new**

### Step-by-Step Process

1. **Identify the Feature**
   - User story: "As a user, I want to [do something]"
   - Example: "Create a subscription plan"

2. **Find in Polar** (`/Users/ankushkumar/Code/payment/billingos`)
   ```bash
   # Search Polar codebase for similar feature
   cd /Users/ankushkumar/Code/payment/billingos
   grep -r "subscription" --include="*.tsx" --include="*.ts"
   ```

3. **Study Polar's Implementation**
   - **Frontend**: Components, hooks, API calls, UI patterns
   - **Backend**: API endpoints, DTOs, services (adapt to NestJS)
   - **Database**: Table structures, relationships, migrations
   - **Stripe**: Integration patterns, webhook handlers

4. **Extract What You Need**
   - Copy frontend components → Adapt imports for BillingOS
   - Copy UI patterns → Already have matching component library
   - Copy database schema → Convert to Supabase migration
   - Adapt backend logic → Convert to NestJS patterns

5. **Simplify**
   - Remove features not in BillingOS scope
   - Simplify complex flows if not needed
   - Keep the core architecture intact

### Example: Copying a Polar Feature

**Feature**: Subscription management page

**Polar Files to Check:**
- `/clients/apps/web/src/app/(dashboard)/[organization]/subscriptions/page.tsx`
- `/clients/apps/web/src/hooks/queries/subscriptions.ts`
- Backend API endpoints (adapt to NestJS)

**BillingOS Implementation:**
1. Copy UI component structure
2. Copy React Query hooks
3. Adapt API endpoints to NestJS
4. Update database schema in Supabase
5. Test and document

### Quick Reference Checklist

Before starting ANY feature implementation:
- [ ] Checked if Polar has this feature
- [ ] Studied Polar's implementation
- [ ] Created `docs/[feature]/plan.md`
- [ ] Listed files to copy from Polar
- [ ] Identified adaptations needed for NestJS
- [ ] Identified features to remove/simplify
- [ ] Ready to implement

**Remember**: Polar has already solved most problems. Don't reinvent - adapt!
