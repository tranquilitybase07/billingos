# Organization Routing & Membership Verification

## Overview

This document describes how BillingOS handles organization routing and membership verification, based on Polar's proven architecture.

## Architecture Pattern

We use **Server Components** with server-side redirects for all organization routing logic. This eliminates race conditions and provides instant, SEO-friendly redirects.

## Key Components

### 1. Dashboard Entry Point
**File**: `apps/web/src/app/dashboard/page.tsx`

```typescript
// Server Component - runs at request time
export default async function DashboardPage() {
  const organizations = await api.get<Organization[]>('/organizations')

  if (!organizations?.length) {
    redirect('/dashboard/create')  // No orgs → create
  }

  redirect(`/dashboard/${organizations[0].slug}`)  // Has orgs → redirect
}
```

**Purpose**: Acts as a router that checks if user has organizations and redirects accordingly.

---

### 2. Organization Layout (Membership Guard)
**File**: `apps/web/src/app/dashboard/[organization]/layout.tsx`

```typescript
export default async function OrganizationLayout({ params }) {
  const organization = await api.get(`/organizations/${orgSlug}`)
  let userOrgs = await api.get('/organizations')

  // Dual-pass verification (handles race conditions)
  if (!userOrgs.some(org => org.id === organization.id)) {
    await new Promise(resolve => setTimeout(resolve, 500))
    userOrgs = await api.get('/organizations')  // Retry with fresh data
  }

  if (!userOrgs.some(org => org.id === organization.id)) {
    redirect('/dashboard')  // Not a member → back to dashboard
  }

  return <>{children}</>  // Verified → render page
}
```

**Purpose**:
- Verifies user is a member of the organization
- Handles race conditions after org creation using dual-pass pattern
- Protects all organization-scoped pages

---

### 3. Organization Creation
**File**: `apps/web/src/app/dashboard/create/page.tsx`

```typescript
const organization = await createOrg.mutateAsync({ name, slug, email })
router.push(`/dashboard/${organization.slug}`)  // Direct redirect
```

**Cache Invalidation** (`apps/web/src/hooks/queries/organization.ts`):
```typescript
onSuccess: (organization) => {
  queryClient.invalidateQueries({ queryKey: organizationKeys.lists() })
  queryClient.refetchQueries({ queryKey: organizationKeys.lists(), type: 'active' })
}
```

**Purpose**: Creates org and immediately redirects, with aggressive cache invalidation.

---

## User Flow

```
User visits /dashboard
  ↓
Server checks organizations
  ↓
  ├─ No orgs → /dashboard/create → Create org → /dashboard/{slug}
  └─ Has orgs → /dashboard/{first-org-slug}
  ↓
Organization Layout verifies membership
  ├─ First pass: Check cached org list
  ├─ If not found: Wait 500ms + retry (handles DB lag)
  └─ Still not found: Redirect to /dashboard
  ↓
Render organization dashboard
```

## Race Condition Handling

**Problem**: After creating an org, the redirect happens before the database transaction is fully committed.

**Solution**: Dual-pass verification in layout
1. First check: Use potentially cached data
2. If org not found: Wait 500ms for DB to sync
3. Second check: Fetch fresh data
4. If still not found: User isn't actually a member

This pattern is copied directly from Polar and handles edge cases reliably.

## Key Differences from Client-Side Approach

| Aspect | Client-Side (Old) | Server-Side (Current) |
|--------|-------------------|----------------------|
| Redirect timing | After React hydration | Immediate (server) |
| Loading states | Visible to user | None (instant redirect) |
| Race conditions | Frequent | Handled by dual-pass |
| SEO | Poor (JS required) | Good (server redirect) |
| Cache handling | Manual invalidation | Server-side fresh fetch |

## Reference

- **Source**: Polar.sh codebase (`/Users/ankushkumar/Code/payment/billingos`)
- **Files Referenced**:
  - `clients/apps/web/src/app/(main)/dashboard/page.tsx`
  - `clients/apps/web/src/app/(main)/dashboard/[organization]/layout.tsx`
  - `clients/apps/web/src/utils/user.ts`

## Troubleshooting

**Issue**: User stuck in redirect loop
**Solution**: Check that organization was actually created in database

**Issue**: "Not a member" error after creating org
**Solution**: Dual-pass should handle this, but check backend `user_organizations` insert

**Issue**: Slow redirects
**Solution**: Normal - 500ms delay is intentional for race condition handling
