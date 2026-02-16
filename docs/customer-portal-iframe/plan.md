# Customer Portal - Iframe Architecture Migration

**Date:** 2026-02-16
**Status:** Planning
**Related:** BillingOS SDK, Subscription Management Platform

## Overview

Convert the existing native React `CustomerPortal` component to an iframe-based architecture, following the same proven pattern used by `CheckoutModal`. This enables end customers to manage their subscriptions through a self-service portal with enhanced security, instant updates, and consistent UX.

## Why Iframe Architecture?

### Current State (Native React)
The CustomerPortal is currently implemented as a native React component in the SDK with:
- Full merchant customization (Tailwind styling, custom components)
- Bundled with merchant's app (larger bundle size)
- Requires npm upgrade for updates
- Merchant controls all portal UI logic

### Problems with Native Approach
1. **Update Friction**: Every portal improvement requires merchants to upgrade SDK version
2. **Version Fragmentation**: Different merchants see different portal UIs based on SDK version
3. **Security Concerns**: Customer payment data handled in merchant's JavaScript context
4. **Maintenance Burden**: Must support multiple SDK versions with different features
5. **Consistency Issues**: Portal UI varies across merchants (customization leads to confusion)

### Benefits of Iframe Approach

**For BillingOS:**
- ✅ **Instant Updates**: Deploy portal improvements immediately without waiting for merchant upgrades
- ✅ **Consistent UX**: All customers see identical portal interface regardless of merchant
- ✅ **Easier Maintenance**: Single codebase for portal UI, no version fragmentation
- ✅ **Better Security**: Customer data isolated in BillingOS domain, easier CSP management
- ✅ **Feature Velocity**: Ship new portal features faster without breaking changes

**For Merchants:**
- ✅ **Always Up-to-Date**: Automatic access to latest portal features and bug fixes
- ✅ **Smaller Bundle**: SDK wrapper is minimal (~5KB vs ~150KB native component)
- ✅ **Less Maintenance**: No need to upgrade SDK for portal improvements
- ✅ **PCI Compliance**: Payment method handling fully isolated from merchant code
- ✅ **Same API**: Component props remain unchanged (backward compatible)

**For End Customers:**
- ✅ **Consistent Experience**: Portal works the same way across all merchants using BillingOS
- ✅ **More Features**: Access to latest subscription management features immediately
- ✅ **Better Performance**: Optimized portal loading and interactions
- ✅ **Enhanced Security**: Payment data never touches merchant's application

## Architecture Strategy

### Reference Implementation: CheckoutModal

We already have a successful iframe component (`CheckoutModal`) that demonstrates this pattern:

**SDK Side:**
- Lightweight wrapper component (Sheet/Dialog/Page container)
- Creates checkout session via API call
- Loads iframe pointing to BillingOS web app (`/embed/checkout/[sessionId]`)
- Handles postMessage communication with iframe
- Forwards events to merchant's callbacks

**Web App Side:**
- Dedicated iframe route (`/embed/checkout/[sessionId]`)
- Fetches session data from API
- Renders payment form with Stripe Elements
- Communicates with parent via postMessage
- Sends success/error/close events

**API Side:**
- Session creation endpoints (`POST /v1/checkout/create`)
- Session validation and data retrieval
- Secure session token authentication

### Applying Same Pattern to CustomerPortal

**SDK Wrapper Component:**
- Keep existing props API (mode, defaultTab, theme, callbacks)
- Create portal session when component mounts
- Render iframe in Sheet/Dialog/Page based on mode prop
- Handle bidirectional postMessage communication
- Trigger merchant callbacks on portal events

**Web App Portal Pages:**
- New route: `/embed/portal/[portalSessionId]`
- Tab-based navigation (subscription, invoices, payment methods, settings)
- All existing CustomerPortal features preserved
- Send events to parent window (update, cancel, close, etc.)
- Dynamic height adjustment for smooth UX

**API Portal Endpoints:**
- Portal session management (create, validate, expire)
- Aggregated portal data endpoint (single call for all data)
- Individual mutation endpoints (update, cancel, add payment method)
- Session-based authentication (similar to checkout)

## Key Design Considerations

### 1. Authentication & Security

**Approach: Portal Session Tokens**
- Similar to checkout session pattern (proven secure)
- SDK creates portal session via API (requires session token)
- API generates secure portal session ID (UUID)
- Portal session stored in database with expiration
- Iframe validates session on load and subsequent API calls

**Security Measures:**
- Origin validation on postMessage events
- CSP headers on iframe pages
- Session expiry: 24 hours (longer than checkout for extended management)
- Customer ID embedded in session (no URL params)
- Organization validation on all API calls

**Why This Works:**
- Session token acts as bearer authentication
- Even if session ID leaks, it's time-limited and customer-scoped
- Same pattern as Stripe's customer portal sessions
- No sensitive data in URL or postMessage

### 2. Display Modes

**Three Modes (Preserving Current API):**

**Sheet (Drawer):**
- Slides in from right side
- 600px width on desktop
- Full width on mobile
- Best for: Dashboard integration, quick access

**Modal (Dialog):**
- Centered overlay
- Max 800px width
- Dims background
- Best for: Focused subscription management

**Page (Full Page):**
- No overlay, renders in page flow
- Full width and height
- No close button (merchant controls navigation)
- Best for: Dedicated portal page

**Why Multiple Modes:**
- Merchants have different integration needs
- Dashboard widgets need drawer
- Marketing pages need modal
- Some want dedicated /account page
- Flexibility without complexity (same component, different container)

### 3. Communication Pattern

**PostMessage Events (Iframe → Parent):**
- `PORTAL_READY` - Portal loaded successfully
- `PORTAL_CLOSE` - User clicked close/back button
- `SUBSCRIPTION_UPDATED` - Plan changed (with new subscription data)
- `SUBSCRIPTION_CANCELLED` - Subscription cancelled
- `PAYMENT_METHOD_ADDED` - New payment method added
- `PAYMENT_METHOD_UPDATED` - Default payment method changed
- `HEIGHT_CHANGED` - Dynamic content height (for smooth resizing)
- `ERROR` - Display error to user

**PostMessage Events (Parent → Iframe):**
- `INIT_PORTAL` - Initialize with theme/locale configuration
- `UPDATE_CONFIG` - Change theme/locale dynamically
- `CLOSE_PORTAL` - Programmatic close

**Why postMessage:**
- Standard cross-origin communication
- Secure with origin validation
- Supports bidirectional communication
- Same pattern as CheckoutModal (consistency)

### 4. Data Loading Strategy

**Initial Load:**
- Single aggregated API call: `GET /v1/portal/:sessionId/data`
- Returns: current subscription, invoices, payment methods, customer info
- Reduces API calls and loading time
- Better UX with single loading state

**Mutations:**
- Individual endpoints for specific actions
- Real-time updates after mutations
- Optimistic UI updates in iframe
- Success events sent to parent for cache invalidation

**Why Aggregated Initial Load:**
- Faster perceived performance
- Single loading spinner
- Reduces API round trips
- All data needed for tabs available immediately

### 5. Feature Parity

**All Current Features Preserved:**
- View current subscription and plan details
- Upgrade/downgrade with proration preview
- View and download invoices
- Retry failed payments
- Add/remove payment methods
- Set default payment method
- Update billing information
- Cancel subscription with feedback form
- View usage for metered features

**Why Full Parity:**
- No regression for existing merchants
- Seamless migration (drop-in replacement)
- Merchants don't lose functionality
- Can deprecate native version cleanly

### 6. Migration Path

**Approach: Complete Replacement**
- Remove native CustomerPortal implementation entirely
- Replace with iframe wrapper (same props API)
- No breaking changes for merchants (API unchanged)
- Backup native version for reference (`CustomerPortal.native.tsx`)

**Why Not Keep Both:**
- Maintaining two implementations doubles maintenance burden
- Feature parity becomes complex
- Merchants don't need customization for portal (standardized UX is better)
- Iframe is superior in every way (security, updates, consistency)

**Rollout Strategy:**
- Deploy iframe version in new SDK release
- Test with internal apps first
- Communicate change in release notes (highlight benefits)
- Monitor for issues, ready to patch quickly

### 7. Hosting Decision

**Approach: BillingOS Web App (`apps/web`)**

Portal pages hosted at: `http://localhost:3000/embed/portal/[sessionId]` (dev)
Production: `https://app.billingos.com/embed/portal/[sessionId]`

**Why Web App (Not Separate Domain):**
- Simpler architecture (no new deployment)
- Reuses existing Next.js infrastructure
- Shares components with main dashboard
- Easier development and debugging
- Same origin policy for cookies (if needed)

**Why Not API Serves HTML:**
- NestJS not optimized for React rendering
- Lose Next.js benefits (SSR, routing, optimization)
- More complex to maintain
- Web app already handles checkout iframe (proven)

**Why Not Separate Embed Domain:**
- Unnecessary complexity for current scale
- Additional deployment and SSL management
- Can migrate later if needed
- Web app already serves `/embed/checkout` successfully

## Comparison: Native vs Iframe

| Aspect | Native React | Iframe (Proposed) |
|--------|--------------|-------------------|
| **Bundle Size** | ~150KB | ~5KB wrapper |
| **Updates** | Requires SDK upgrade | Instant |
| **Customization** | Full (Tailwind, custom render) | Limited (themes only) |
| **Security** | Merchant context | Isolated BillingOS context |
| **Consistency** | Varies by merchant | Same for all merchants |
| **Maintenance** | Multiple versions | Single codebase |
| **PCI Compliance** | Merchant responsibility | BillingOS handles |
| **Feature Velocity** | Slow (SDK releases) | Fast (deploy anytime) |
| **SEO** | Indexable | Not indexable (doesn't matter for portal) |
| **Performance** | Slightly faster | Iframe overhead (~50-200ms) |
| **Mobile** | Good | Good (responsive iframe) |

**Decision: Iframe is the clear winner for customer portals**

## Technical Architecture

### High-Level Flow

```
1. Merchant renders <CustomerPortal mode="drawer" />
2. SDK calls API: POST /v1/portal/create (with sessionToken)
3. API creates portal session, returns sessionId
4. SDK builds iframe URL: /embed/portal/{sessionId}
5. SDK renders Sheet/Dialog with iframe inside
6. Iframe loads, validates session, fetches portal data
7. User interacts with portal (change plan, update payment, etc.)
8. Iframe sends events to parent via postMessage
9. SDK forwards events to merchant's callbacks
10. Merchant's app updates UI (refresh data, show success message)
```

### Component Structure

**SDK (`billingos-sdk`):**
```
src/components/CustomerPortal/
├── CustomerPortal.tsx           # Iframe wrapper component
├── CustomerIframe.tsx           # Reusable iframe element
├── hooks/
│   ├── usePortalSession.ts      # Create and manage portal session
│   └── usePortalMessaging.ts    # Handle postMessage communication
└── utils/
    └── messaging.ts             # Message type definitions
```

**Web App (`billingos/apps/web`):**
```
src/app/embed/portal/[portalSessionId]/
├── page.tsx                     # Main portal page (Server Component)
├── layout.tsx                   # Portal-specific layout (no nav/footer)
├── components/
│   ├── PortalContent.tsx       # Client Component with tabs
│   ├── SubscriptionTab.tsx     # Plan details, upgrade/downgrade
│   ├── InvoicesTab.tsx         # Billing history, downloads
│   ├── PaymentMethodsTab.tsx   # Card management
│   └── SettingsTab.tsx         # Billing info, preferences
└── hooks/
    ├── usePortalSession.ts     # Fetch portal data from API
    └── useParentMessaging.ts   # postMessage to parent window
```

**API (`billingos/apps/api`):**
```
src/v1/portal/
├── portal.controller.ts         # Portal endpoints
├── portal.service.ts            # Business logic
├── portal.module.ts             # Module definition
└── dto/
    ├── create-portal-session.dto.ts
    └── portal-data.dto.ts
```

### Database Changes

**New Table: `portal_sessions`**
```
- id (uuid, primary key)
- customer_id (uuid, foreign key)
- organization_id (uuid, foreign key)
- created_at (timestamp)
- expires_at (timestamp)
- metadata (jsonb, optional config)
```

**Why Separate Table:**
- Clean separation from checkout sessions
- Different expiry times (24h vs 1h)
- Different access patterns
- Easier to audit portal access

## Implementation Phases

### Phase 1: Backend Foundation
- Create `v1/portal` module in API
- Portal session management (create, validate, expire)
- Aggregated data endpoint
- Database migration for `portal_sessions` table

### Phase 2: Frontend Iframe Pages
- Create `/embed/portal/[portalSessionId]` route
- Build tab-based portal interface
- Implement all portal features (subscription, invoices, payments, settings)
- Add postMessage communication hooks
- Mobile-responsive design

### Phase 3: SDK Wrapper
- Create iframe-based CustomerPortal component
- Portal session creation hook
- PostMessage communication hook
- Preserve existing props API
- Handle all three display modes

### Phase 4: Integration & Testing
- Replace native CustomerPortal with iframe version
- Test all display modes
- Test all portal features
- Test postMessage events
- Mobile testing
- Error handling and edge cases

### Phase 5: Documentation & Deployment
- Update SDK documentation
- Add migration guide (even though API unchanged)
- Document postMessage events for debugging
- Release notes highlighting benefits
- Deploy and monitor

## Success Metrics

**How We'll Know This Works:**
1. All existing portal features work identically in iframe
2. Zero breaking changes for merchants (same props API)
3. Faster feature deployment (no SDK release needed)
4. Reduced support tickets (consistent UX)
5. Smaller merchant bundle sizes
6. Positive merchant feedback on auto-updates

## Risks & Mitigations

**Risk: Iframe Performance**
- Mitigation: Optimize initial load, preload iframe, minimize dependencies

**Risk: PostMessage Complexity**
- Mitigation: Reuse proven CheckoutModal patterns, comprehensive logging

**Risk: Height Calculation**
- Mitigation: Dynamic height events, fallback max-height with scroll

**Risk: Mobile UX**
- Mitigation: Responsive design, touch-friendly interactions, test on devices

**Risk: Session Expiry**
- Mitigation: 24h expiry (generous), auto-refresh, clear error messages

## Next Steps

1. Review and approve this plan
2. Create `progress.md` to track implementation
3. Start with Phase 1 (Backend Foundation)
4. Iterate through phases with testing at each step
5. Document learnings in `final.md` when complete

## References

- Hybrid Component Strategy: `/Users/ankushkumar/Code/billingos-sdk/docs/architecture/hybrid-component-strategy.md`
- Existing CheckoutModal: `/Users/ankushkumar/Code/billingos-sdk/src/components/CheckoutModal/`
- Native CustomerPortal: `/Users/ankushkumar/Code/billingos-sdk/src/components/CustomerPortal/`
- Checkout Iframe Implementation: `/Users/ankushkumar/Code/billingos/apps/web/src/app/embed/checkout/`
