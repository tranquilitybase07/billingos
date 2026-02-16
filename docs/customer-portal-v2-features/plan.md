# Customer Portal V2 Features - Implementation Plan

**Created:** 2026-02-16
**Status:** Planning Complete
**Version:** 2.0

---

## Overview

This document outlines the approach for adding four critical self-service features to the iframe-based customer portal:

1. **Invoices** - List view with PDF download capability
2. **Payment Methods** - Full CRUD operations with Stripe Payment Element
3. **Subscription Cancellation** - Simple confirmation flow with feedback
4. **Settings** - Account details management and usage/quota tracking

These features complete the customer self-service portal, enabling customers to manage their entire billing relationship without merchant intervention.

---

## Critical Finding: No Pre-Built Stripe Components for Connect

**Key Discovery:**
After extensive research, Stripe does NOT provide pre-built customer portal components for Connect accounts. Unlike regular Stripe accounts (which have Customer Portal), Connect platforms must build custom UI.

**Why This Matters:**
- Cannot use Stripe's hosted portal
- Must build custom components for all features
- All Stripe API operations require `stripeAccount` parameter
- More development work, but more control over UX

**What We'll Use Instead:**
- **Stripe Payment Element** - Modern, customizable payment method collection
- **Stripe API** - Direct API calls for all operations
- **Custom UI** - Built with shadcn/ui components
- **Polar.sh Reference** - Proven implementation patterns

---

## Architecture Approach

### 1. Invoices Feature (Easiest)

**Purpose:**
Allow customers to view their billing history and download PDF invoices.

**Backend Approach:**
```
Portal Service (portal.service.ts)
├── Fetch invoices from Stripe API
├── Use stripe.invoices.list(customerId, { stripeAccount })
├── Map to PortalInvoice DTO
└── Include invoice_pdf URL for downloads
```

**Frontend Approach:**
```
InvoicesTab Component
├── Display table with columns: Date, Amount, Status, Actions
├── Status badges (paid, open, void, uncollectible)
├── Download button → window.open(invoice_pdf)
├── Empty state for customers with no invoices
└── Loading skeleton during fetch
```

**Polar Pattern:**
Polar has a simple invoice list with download links - straightforward read-only display.

**Data Flow:**
1. Portal loads → fetch invoices via `/v1/portal/:sessionId/data`
2. Display in table sorted by date (newest first)
3. User clicks download → open PDF in new tab
4. No postMessage events needed (read-only)

**Edge Cases:**
- Customer with no invoices → friendly empty state
- Failed invoice fetch → error message with retry
- Large invoice list → pagination or scroll

---

### 2. Subscription Cancellation (Medium Complexity)

**Purpose:**
Allow customers to cancel their subscription with optional feedback.

**Backend Approach:**
```
New Endpoint: POST /v1/portal/:sessionId/cancel-subscription
├── Validate portal session
├── Fetch subscription from database
├── Call stripe.subscriptions.cancel(subscriptionId, {
│     stripeAccount: organizationStripeAccountId,
│     prorate: false,
│     invoice_now: false
│   })
├── Update subscription status in database
└── Return updated subscription
```

**Frontend Approach:**
```
SubscriptionTab
└── Add "Cancel Subscription" button

CancelSubscriptionModal Component
├── Warning message about cancellation
├── Cancellation timing options:
│   ├── Immediate (cancel now, lose access)
│   └── End of period (cancel but keep access until period ends)
├── Optional reason dropdown:
│   ├── Too expensive
│   ├── Not using enough
│   ├── Missing features
│   ├── Found alternative
│   └── Other
├── Optional feedback textarea
├── Confirm button (requires checkbox)
└── Cancel button
```

**postMessage Events:**
- Send `SUBSCRIPTION_CANCELLED` on successful cancellation
- Parent app can listen and show confirmation message

**Polar Pattern:**
Polar has a multi-step cancellation flow with retention offers. We'll start simple (just confirmation), can add retention later.

**Data Flow:**
1. User clicks "Cancel Subscription"
2. Modal opens with warning
3. User selects timing + reason
4. Confirm → API call to cancel
5. Success → refresh portal data
6. Send postMessage event
7. Update UI to show cancelled status

**Edge Cases:**
- Subscription already cancelled → hide cancel button
- Stripe API failure → show error, don't update UI
- Trial subscription → explain they'll lose trial benefits

---

### 3. Settings Tab (Medium Complexity)

**Purpose:**
Display and edit account details, show usage metrics for metered features.

**Backend Approach:**
```
Account Details:
├── Fetch customer data (already in portal data)
├── Update endpoint: PATCH /v1/portal/:sessionId/customer
├── Update customer in database + Stripe
└── Validate email format, required fields

Usage Tracking:
├── Query usage_records table filtered by customer
├── Join with features table to get limits
├── Calculate usage percentage: (used / limit) * 100
└── Return array of { featureName, used, limit, percentage }
```

**Frontend Approach:**
```
SettingsTab Component
├── Account Details Section
│   ├── Form with fields: name, email, billing address
│   ├── Editable inputs
│   ├── Save button → PATCH request
│   └── Success toast on save
│
└── Usage & Quotas Section
    ├── List of metered features
    ├── Progress bars showing usage %
    ├── Warning badge if >80% used
    └── Upgrade prompt if at limit
```

**Data Structure:**
```typescript
interface UsageMetric {
  featureId: string
  featureName: string
  used: number
  limit: number
  percentage: number
  unit: string // e.g., "requests", "GB", "seats"
}
```

**Polar Pattern:**
Polar shows usage metrics prominently with visual indicators for quota limits.

**Data Flow:**
1. Load usage data with portal data
2. Display account form (pre-filled)
3. User edits → enable save button
4. Save → validate → API call
5. Success → refresh data
6. Usage bars update on refresh

**Edge Cases:**
- No metered features → hide usage section
- Invalid email → client-side validation
- Stripe customer update fails → show error, revert form

---

### 4. Payment Methods (Highest Complexity)

**Purpose:**
Full CRUD for payment methods using modern Stripe Payment Element.

**Why This Is Complex:**
- Requires Stripe.js loading in iframe
- SetupIntent creation and confirmation
- 3D Secure / SCA authentication handling
- Confirmation token flow
- Multiple API endpoints
- Careful state management

**Backend Approach:**

```
New Endpoints:

1. POST /v1/portal/:sessionId/setup-intent
   ├── Create Stripe SetupIntent
   ├── stripe.setupIntents.create({
   │     customer: customerId,
   │     payment_method_types: ['card']
   │   }, { stripeAccount })
   └── Return client_secret

2. POST /v1/portal/:sessionId/confirm-payment-method
   ├── Receive confirmation_token from frontend
   ├── Confirm SetupIntent with token
   ├── stripe.setupIntents.confirm(setupIntentId, {
   │     confirmation_token,
   │     return_url: portalUrl
   │   }, { stripeAccount })
   └── Return payment method ID

3. DELETE /v1/portal/:sessionId/payment-methods/:paymentMethodId
   ├── Validate ownership
   ├── stripe.paymentMethods.detach(pmId, { stripeAccount })
   └── Return success

4. PATCH /v1/portal/:sessionId/default-payment-method
   ├── Update customer.invoice_settings.default_payment_method
   ├── stripe.customers.update(customerId, {
   │     invoice_settings: { default_payment_method: pmId }
   │   }, { stripeAccount })
   └── Return updated customer
```

**Frontend Approach:**

```
PaymentMethodsTab Component
├── List of saved payment methods
│   ├── Card brand icon
│   ├── Last 4 digits
│   ├── Expiry date
│   ├── "Default" badge
│   ├── Actions dropdown:
│   │   ├── Set as default
│   │   └── Remove
│   └── Empty state if no methods
│
└── "Add Payment Method" button

AddPaymentMethodModal Component
├── Load Stripe.js
├── Create Stripe Payment Element
├── Mount element in modal
├── Handle form submit:
│   ├── Call stripe.confirmSetup({ elements, confirmParams })
│   ├── Stripe handles 3D Secure automatically
│   ├── On success → refresh payment methods
│   └── Send PAYMENT_METHOD_ADDED event
└── Error handling for card declines
```

**Critical Flow: SetupIntent + Confirmation Token**

This is Stripe's modern recommended flow:

```
1. User clicks "Add Payment Method"
   └── Modal opens

2. Frontend creates SetupIntent
   └── POST /v1/portal/:sessionId/setup-intent
   └── Receives client_secret

3. Mount Payment Element
   └── stripe.elements({ clientSecret })
   └── paymentElement.mount('#payment-element')

4. User enters card details
   └── Stripe validates in real-time

5. User clicks "Save Card"
   └── Call stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href
        }
      })

6. Stripe handles 3D Secure
   └── Shows authentication modal if needed
   └── Redirects to return_url on success

7. Frontend confirms success
   └── Check setupIntent.status === 'succeeded'
   └── Extract payment_method from setupIntent
   └── Refresh payment methods list
```

**Polar Pattern:**
Polar uses Payment Element with SetupIntent flow. Has excellent error handling for card declines and authentication failures.

**postMessage Events:**
- `PAYMENT_METHOD_ADDED` - When new card saved
- `PAYMENT_METHOD_UPDATED` - When default changed
- `PAYMENT_METHOD_REMOVED` - When card removed

**Data Flow:**
1. Load saved payment methods (already in portal data)
2. Display list with actions
3. Add flow:
   - Create SetupIntent → mount Payment Element → confirm → refresh
4. Remove flow:
   - Confirm modal → API call → refresh
5. Set default flow:
   - API call → refresh → show toast

**Edge Cases:**
- No payment methods → prominent "Add Card" CTA
- Card decline → show Stripe error message
- 3D Secure failure → allow retry
- Network error during setup → cleanup intent
- Cannot remove default → must set new default first
- Cannot remove only payment method if subscription active

---

## Critical Patterns for Stripe Connect

**Every Stripe API call must include the connected account ID:**

```typescript
// ❌ WRONG - Will fail for Connect
await stripe.customers.retrieve(customerId)

// ✅ CORRECT - Include stripeAccount
await stripe.customers.retrieve(customerId, {
  stripeAccount: organizationStripeAccountId
})
```

**This applies to ALL operations:**
- Invoices: `stripe.invoices.list(params, { stripeAccount })`
- Subscriptions: `stripe.subscriptions.cancel(id, params, { stripeAccount })`
- Customers: `stripe.customers.update(id, data, { stripeAccount })`
- Payment Methods: `stripe.paymentMethods.detach(id, { stripeAccount })`
- Setup Intents: `stripe.setupIntents.create(params, { stripeAccount })`

**Backend Implementation:**
```typescript
// Get organization's Stripe account from database
const organization = await this.supabase
  .from('organizations')
  .select('stripe_account_id')
  .eq('id', organizationId)
  .single()

const stripeAccount = organization.data.stripe_account_id

// Use in all Stripe calls
const invoices = await this.stripe.invoices.list(
  { customer: stripeCustomerId, limit: 100 },
  { stripeAccount }
)
```

---

## Reference Implementation: Polar.sh

**Location:** `/Users/ankushkumar/Code/payment/billingos` (Polar repo)

**Key Files to Reference:**

**Invoices:**
- Frontend: Polar's invoice list component
- Pattern: Simple table with download buttons

**Cancellation:**
- Frontend: Polar's cancellation flow
- Pattern: Multi-step with retention (we'll simplify)

**Settings:**
- Frontend: Polar's customer profile editor
- Pattern: Form with validation and save

**Payment Methods:**
- Frontend: Polar's payment method management
- Pattern: Payment Element integration, SetupIntent flow
- Backend: Stripe API calls with proper error handling

**General Approach:**
1. Study Polar's UI patterns
2. Copy component structure
3. Adapt for our simpler iframe architecture
4. Remove features not needed for BillingOS
5. Ensure all Stripe calls include `stripeAccount`

---

## Security Considerations

**Portal Session Validation:**
- Every operation must validate portal session first
- Check session not expired
- Verify customer ownership

**Stripe Operations:**
- Validate customer belongs to portal session
- Never expose Stripe secret keys to frontend
- Use Stripe publishable key only in frontend
- Handle webhook verification for async updates

**Payment Method Security:**
- Never store raw card numbers
- Use Stripe's tokenization (Payment Element handles this)
- Validate payment method belongs to customer before removal
- Require confirmation for destructive actions

**3D Secure / SCA:**
- Let Stripe Payment Element handle automatically
- Provide proper return_url for redirect flow
- Handle authentication failures gracefully

**Rate Limiting:**
- Limit payment method additions (prevent abuse)
- Throttle cancellation attempts
- Monitor for suspicious activity

---

## Implementation Order & Rationale

**Phase 1: Invoices** (Start Here)
- **Why First:** Read-only, no complex state, no Stripe writes
- **Complexity:** Low
- **Time:** 2-4 hours
- **Value:** Immediate customer benefit

**Phase 2: Subscription Cancellation**
- **Why Second:** Single write operation, straightforward flow
- **Complexity:** Medium
- **Time:** 3-6 hours
- **Value:** Critical self-service feature

**Phase 3: Settings**
- **Why Third:** Moderate complexity, builds confidence
- **Complexity:** Medium
- **Time:** 4-6 hours
- **Value:** Account management + usage visibility

**Phase 4: Payment Methods** (Save for Last)
- **Why Last:** Highest complexity, requires Stripe.js integration
- **Complexity:** High
- **Time:** 8-12 hours
- **Value:** Essential for subscription management

**Total Estimated Time:** 17-28 hours across 4 phases

---

## Testing Strategy

**Unit Testing:**
- Backend services (portal.service.ts methods)
- Stripe API mocking for reliable tests
- DTO validation

**Integration Testing:**
- Full flow for each feature
- Stripe test mode for payment methods
- Test cards for 3D Secure scenarios

**Manual Testing Checklist:**
```
Invoices:
[ ] List displays correctly
[ ] PDF download works
[ ] Empty state shows
[ ] Error handling works

Cancellation:
[ ] Modal opens
[ ] Immediate cancel works
[ ] End-of-period cancel works
[ ] Reason tracking saves
[ ] postMessage event fires

Settings:
[ ] Account details load
[ ] Form saves correctly
[ ] Usage metrics display
[ ] Validation works

Payment Methods:
[ ] List displays saved cards
[ ] Add card flow works
[ ] 3D Secure authentication works
[ ] Set default works
[ ] Remove card works
[ ] Cannot remove last card with active subscription
[ ] Error messages clear
```

**Test Scenarios:**
- New customer (no invoices, no payment methods)
- Active subscriber (has invoices, has card)
- Trial customer (no invoices yet)
- Customer with failed payments
- Customer with multiple payment methods

---

## Open Questions

1. **Cancellation Retention:**
   - Should we add retention offers (discounts, pause subscription)?
   - Start simple, add later?

2. **Invoice Pagination:**
   - How many invoices to fetch? (100, 500, all?)
   - Should we paginate on frontend?

3. **Payment Method Limits:**
   - Limit how many cards customer can save?
   - Stripe doesn't enforce limits by default

4. **Usage Alerts:**
   - Should we show alerts when approaching quota?
   - Email notifications for usage thresholds?

5. **Cancellation Surveys:**
   - Just reason dropdown or full survey?
   - Store feedback for analytics?

---

## Future Enhancements (Not V2)

- **Invoices:**
  - Email invoice to customer
  - Invoice disputes / notes
  - Payment retry for failed invoices

- **Cancellation:**
  - Retention offers (discount, pause, downgrade)
  - Exit surveys with analytics
  - Reactivation campaigns

- **Settings:**
  - Password change (if using password auth)
  - Notification preferences
  - Data export (GDPR)

- **Payment Methods:**
  - Bank accounts (ACH/SEPA)
  - Digital wallets (Apple Pay, Google Pay)
  - Payment method verification requirements

---

## Success Criteria

**V2 is complete when:**
- ✅ Customers can view all invoices and download PDFs
- ✅ Customers can cancel subscriptions with optional feedback
- ✅ Customers can edit account details and view usage
- ✅ Customers can add, remove, and manage payment methods
- ✅ All operations work with Stripe Connect (stripeAccount parameter)
- ✅ postMessage events fire for all state changes
- ✅ Mobile responsive on all features
- ✅ Error handling is graceful and user-friendly
- ✅ Loading states are smooth
- ✅ No breaking changes to existing V1 features

---

## Resources

**Stripe Documentation:**
- [Payment Element](https://stripe.com/docs/payments/payment-element)
- [SetupIntents](https://stripe.com/docs/payments/save-and-reuse)
- [Connect Account Operations](https://stripe.com/docs/connect/direct-charges)
- [Customer Portal (for reference only - not available for Connect)](https://stripe.com/docs/customer-management)

**Polar Reference:**
- Repo: `/Users/ankushkumar/Code/payment/billingos`
- Invoice components, cancellation flows, payment method management

**BillingOS Docs:**
- V1 Implementation: `docs/customer-portal-iframe/plan.md`
- Progress Tracking: `docs/customer-portal-iframe/progress.md`
- Final Summary: `docs/customer-portal-iframe/final.md`

---

## Key Decisions Made

1. **No Stripe Pre-Built Components** - Build custom UI with Payment Element
2. **Implementation Order** - Invoices → Cancellation → Settings → Payment Methods
3. **Modern Stripe Flow** - Use SetupIntent + confirmation token (not legacy token flow)
4. **Simple Cancellation** - No retention offers in V2 (can add later)
5. **Usage in Settings** - Display metrics prominently to drive engagement
6. **Polar as Reference** - Use proven patterns, adapt for our architecture
7. **Maintain Iframe Architecture** - All features live in iframe, communicate via postMessage

---

**Next Steps:**
1. Review this plan
2. Create progress.md for tracking
3. Begin Phase 1 (Invoices) implementation
