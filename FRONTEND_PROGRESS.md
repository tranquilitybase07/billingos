# BillingOS Frontend Implementation Progress

## ✅ Completed (Phase 1 - Foundation)

### 1. Dependencies Installed
- ✅ @tanstack/react-query
- ✅ zod
- ✅ framer-motion
- ✅ @stripe/stripe-js
- ✅ @stripe/react-stripe-js

### 2. React Query Setup
- ✅ `providers/QueryProvider.tsx` - Query client provider with dev tools
- ✅ Updated root layout to include QueryProvider
- ✅ Configured with sensible defaults (60s stale time, 1 retry)

### 3. API Client Layer
- ✅ `lib/api/client.ts` - Client-side API wrapper
  - Automatic Supabase auth token injection
  - Error handling with APIError class
  - REST methods (GET, POST, PATCH, PUT, DELETE)

- ✅ `lib/api/server.ts` - Server-side API wrapper
  - Server-side auth token retrieval
  - No-cache by default for SSR
  - Same interface as client

- ✅ `lib/api/types.ts` - TypeScript type definitions
  - Organization types
  - Account types
  - Member types
  - Payment status types
  - User types
  - All DTOs

## 📝 Next Steps (Remaining Implementation)

### Phase 2: React Query Hooks (Estimated: 2-3 hours)

Create hooks in `hooks/queries/`:

**organization.ts**:
```typescript
- useListOrganizations()
- useOrganization(id)
- useCreateOrganization()
- useUpdateOrganization()
- useSubmitBusinessDetails()
- useGetPaymentStatus()
- useDeleteOrganization()
```

**member.ts**:
```typescript
- useListMembers(orgId)
- useInviteMember(orgId)
- useRemoveMember(orgId)
- useLeaveOrganization(orgId)
```

**account.ts**:
```typescript
- useCreateAccount()
- useGetAccount(id)
- useGetOnboardingLink(id)
- useGetDashboardLink(id)
- useSyncAccount(id)
```

### Phase 3: Utilities (Estimated: 1-2 hours)

Create utility files in `lib/`:

**organization.ts**:
```typescript
- getOrganizationBySlug(slug) - Server-side org fetching
- checkUserIsMember(orgId, userId)
- checkUserIsAdmin(orgId, userId)
```

**user.ts**:
```typescript
- getCurrentUser() - Get authenticated user
- getUserOrganizations() - Get user's orgs
```

**navigation.ts**:
```typescript
- orgPath(slug, path) - Generate org URLs
- Helper functions for navigation
```

### Phase 4: Dashboard Layout (Estimated: 4-6 hours)

**Directory structure**:
```
app/dashboard/
├── [organization]/
│   ├── layout.tsx
│   ├── (header)/
│   │   ├── layout.tsx
│   │   ├── page.tsx (dashboard home)
│   │   ├── finance/
│   │   │   └── account/
│   │   │       └── page.tsx
│   │   └── settings/
│   │       └── members/
│   │           └── page.tsx
│   └── (create)/
│       └── create/
│           └── page.tsx
```

**Components**:
- `components/layout/DashboardLayout.tsx`
- `components/layout/DashboardSidebar.tsx`
- `components/layout/MobileNav.tsx`

**Features**:
- Responsive sidebar (collapsible)
- Organization switcher
- Navigation sections (Home, Finance, Settings)
- Mobile drawer navigation
- User menu

### Phase 5: Organization Creation (Estimated: 3-4 hours)

**Page**: `/dashboard/(create)/create/page.tsx`

**Component**: `components/onboarding/OrganizationStep.tsx`

**Features**:
- Organization name input
- Auto-slug generation
- Slug availability check
- Email input
- Website input (optional)
- Terms acceptance checkbox
- Form validation (Zod)
- Loading states
- Error handling
- Redirect after creation

**Zod Schema**:
```typescript
const createOrgSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(255).regex(/^[a-z0-9-]+$/),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  acceptTerms: z.boolean().refine(val => val === true),
})
```

### Phase 6: Finance/Account Setup (Estimated: 6-8 hours)

**Page**: `/dashboard/[organization]/(header)/finance/account/page.tsx`

**Main Component**: `components/finance/StreamlinedAccountReview.tsx`

**Sub-components**:
- `components/finance/AccountStep.tsx`
- `components/finance/IdentityStep.tsx`
- `components/finance/ProgressIndicator.tsx`

**Features**:
- Multi-step wizard UI
- Step 1: Submit business details
- Step 2: Create Stripe Connect account
- Step 3: Identity verification
- Progress indicator with states
- Stripe onboarding redirect
- Handle Stripe return URL
- Display account status
- Admin-only account creation
- Account list for admins

**Stripe Integration**:
```typescript
// Load Stripe
const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// Create account
const account = await createAccount.mutateAsync({...})

// Get onboarding link
const link = await getOnboardingLink.mutateAsync(account.id)

// Redirect to Stripe
window.location.href = link.url

// Identity verification
const session = await createIdentityVerification.mutateAsync()
const result = await stripe.verifyIdentity(session.client_secret)
```

### Phase 7: Team Management (Estimated: 4-5 hours)

**Page**: `/dashboard/[organization]/(header)/settings/members/page.tsx`

**Component**: `components/members/MembersTable.tsx`

**Features**:
- DataTable with members list
- Columns: Member (avatar + email + badges), Joined on, Actions
- Admin badge display
- "You" badge for current user
- Invite member modal
- Remove member confirmation dialog
- Leave organization option (non-admin)
- Email validation for invites
- Loading states
- Error handling

**Components**:
- `components/members/InviteMemberModal.tsx`
- `components/members/ConfirmRemoveDialog.tsx`

### Phase 8: Context Providers (Estimated: 2-3 hours)

**OrganizationContext**:
```typescript
- Current organization state
- Loading state
- Refetch function
- Helper functions (isAdmin, isMember)
```

**Usage**:
```typescript
const { organization, isLoading, isAdmin, refetch } = useOrganization()
```

### Phase 9: Styling & Polish (Estimated: 3-4 hours)

**Tasks**:
- Match Polar's exact colors (polar-50 to polar-950)
- Copy shadow styles
- Animation transitions (Framer Motion)
- Toast notifications
- Loading skeletons
- Empty states
- Error states
- Mobile responsive design
- Dark mode polish

### Phase 10: Testing & Bug Fixes (Estimated: 4-6 hours)

**Test Flows**:
1. Create organization
2. Submit business details
3. Create Stripe account
4. Complete onboarding
5. Invite member
6. Remove member
7. Leave organization
8. Mobile navigation
9. Dark mode
10. Error cases

---

## Quick Start Guide for Remaining Implementation

### 1. Create React Query Hooks

Start with organization hooks since they're needed first:

```bash
# Create the hooks file
touch apps/web/src/hooks/queries/organization.ts
```

Copy the pattern from Polar's `org.ts` and adapt for billingOS API.

### 2. Build Dashboard Layout

```bash
# Create directory structure
mkdir -p apps/web/src/app/dashboard/\[organization\]/\(header\)
mkdir -p apps/web/src/app/dashboard/\(create\)/create
mkdir -p apps/web/src/components/layout
```

Copy layout files from Polar, adapt sidebar navigation.

### 3. Organization Creation Page

```bash
mkdir -p apps/web/src/components/onboarding
```

Copy `OrganizationStep.tsx` from Polar, adapt form submission.

### 4. Continue with Phases 6-10

Follow the plan above, copying components from Polar and adapting to billingOS architecture.

---

## Key Files to Copy from Polar

**High Priority**:
1. `DashboardLayout.tsx` → Layout shell
2. `DashboardSidebar.tsx` → Navigation
3. `OrganizationStep.tsx` → Org creation
4. `StreamlinedAccountReview.tsx` → Account setup wizard
5. `MembersPage.tsx` → Team management

**Medium Priority**:
6. `AccountStep.tsx` → Stripe account step
7. `IdentityStep.tsx` → Identity verification
8. Animation utilities → Framer Motion patterns
9. Toast components → Notifications
10. Modal components → Dialog system

**Adapt These**:
- Replace Polar API calls with billingOS API
- Use Supabase auth instead of custom auth
- Update permission checks
- Remove AI validation features
- Simplify where needed

---

## Estimated Total Time

- **Phase 1 (Completed)**: ~2 hours ✅
- **Phases 2-10 (Remaining)**: ~35-45 hours

**Total**: ~37-47 hours for full implementation

**Minimum Viable** (just core flows): ~20-25 hours
- Skip animations
- Skip polish
- Basic styling
- Core functionality only

---

## Progress Tracking

Use this document to track completion:

- [x] Phase 1: Foundation
- [ ] Phase 2: React Query Hooks
- [ ] Phase 3: Utilities
- [ ] Phase 4: Dashboard Layout
- [ ] Phase 5: Organization Creation
- [ ] Phase 6: Finance/Account Setup
- [ ] Phase 7: Team Management
- [ ] Phase 8: Context Providers
- [ ] Phase 9: Styling & Polish
- [ ] Phase 10: Testing

---

## Notes

- UI components are already copied ✅
- Backend API is complete ✅
- Database schema is ready ✅
- Main work is connecting frontend to backend
- Follow Polar's patterns closely
- Test each phase before moving to next
- Mobile-first approach
- Dark mode support

---

## Need Help?

Refer to:
1. Polar source code at `/Users/ankushkumar/Code/payment/billingos/clients/apps/web`
2. Backend API docs in `BACKEND_IMPLEMENTATION.md`
3. API test examples in `API_TESTS.md`
4. This progress document for structure

The foundation is solid - now it's systematic implementation following Polar's proven patterns!
