# Customer Portal V2 Features - Implementation Progress

**Started:** 2026-02-16
**Status:** 🚧 In Progress
**Current Phase:** Phase 1 - Invoices

---

## Phase 1: Invoices Feature ⏸️ Pending

**Goal:** Allow customers to view billing history and download PDF invoices

**Estimated Time:** 2-4 hours
**Complexity:** Low (read-only feature)

### Backend Tasks

- [ ] Update `portal.service.ts` to fetch invoices from Stripe
  - [ ] Add `getInvoicesForCustomer()` method
  - [ ] Query Stripe with `stripe.invoices.list(params, { stripeAccount })`
  - [ ] Fetch up to 100 most recent invoices
  - [ ] Map Stripe invoice object to PortalInvoice DTO
  - [ ] Include `invoice_pdf` URL for downloads
  - [ ] Handle pagination if needed

- [ ] Update PortalData DTO in `portal-data.dto.ts`
  - [ ] Ensure PortalInvoice interface includes all fields:
    - `id`, `status`, `amount`, `currency`
    - `dueDate`, `paidAt`, `createdAt`
    - `invoiceUrl`, `invoicePdf`
    - `number` (invoice number for display)

- [ ] Update `getPortalData()` to include invoices
  - [ ] Call `getInvoicesForCustomer()` in aggregation
  - [ ] Return invoices array in response

### Frontend Tasks

- [ ] Replace InvoicesTab placeholder in `PortalContent.tsx`
  - [ ] Create new component file or enhance inline component
  - [ ] Design invoice table layout:
    - Columns: Date, Invoice #, Amount, Status, Actions
    - Mobile responsive (stack on small screens)
  - [ ] Add status badges with colors:
    - `paid` → green
    - `open` → blue
    - `void` → gray
    - `uncollectible` → red
  - [ ] Format currency with proper symbols
  - [ ] Format dates in readable format

- [ ] Add download functionality
  - [ ] Download button/icon for each invoice
  - [ ] Click → `window.open(invoice.invoicePdf, '_blank')`
  - [ ] Show loading state during PDF fetch
  - [ ] Handle missing PDF gracefully

- [ ] Add empty state
  - [ ] Show when `invoices.length === 0`
  - [ ] Friendly message: "No invoices yet"
  - [ ] Optional: Show when first invoice will be generated

- [ ] Add loading skeleton
  - [ ] Display while fetching portal data
  - [ ] Table skeleton with shimmer effect

- [ ] Error handling
  - [ ] Show error message if invoice fetch fails
  - [ ] Retry button

### Testing Checklist

- [ ] Backend returns invoices correctly
  - [ ] Test with customer who has invoices
  - [ ] Test with customer who has no invoices
  - [ ] Verify all invoice fields populated
  - [ ] Verify invoice_pdf URL is valid

- [ ] Frontend displays correctly
  - [ ] Table renders with all columns
  - [ ] Status badges show correct colors
  - [ ] Currency formatting correct
  - [ ] Date formatting readable

- [ ] Download works
  - [ ] Click download → PDF opens in new tab
  - [ ] PDF displays correctly
  - [ ] Works on mobile

- [ ] Empty state
  - [ ] Shows when no invoices
  - [ ] Message is clear

- [ ] Responsive design
  - [ ] Desktop: full table
  - [ ] Tablet: readable layout
  - [ ] Mobile: stacked cards or simplified table

### Implementation Notes

_(To be filled during implementation)_

### Blockers

None currently

---

## Phase 2: Subscription Cancellation ⏸️ Pending

**Goal:** Allow customers to cancel their subscription with optional feedback

**Estimated Time:** 3-6 hours
**Complexity:** Medium (single write operation with UI flow)

### Backend Tasks

- [ ] Create new endpoint in `portal.controller.ts`
  - [ ] Route: `POST /v1/portal/:sessionId/cancel-subscription`
  - [ ] Use SessionTokenAuthGuard (no auth needed - session validated)
  - [ ] Accept DTO with: `subscriptionId`, `timing`, `reason`, `feedback`

- [ ] Create DTO: `cancel-subscription.dto.ts`
  ```typescript
  class CancelSubscriptionDto {
    subscriptionId: string // required
    timing: 'immediate' | 'end_of_period' // required
    reason?: string // optional
    feedback?: string // optional
  }
  ```

- [ ] Implement `cancelSubscription()` in `portal.service.ts`
  - [ ] Validate portal session
  - [ ] Fetch subscription from database
  - [ ] Verify subscription belongs to portal customer
  - [ ] Call Stripe API:
    ```typescript
    const canceledSub = await stripe.subscriptions.cancel(
      subscriptionId,
      {
        prorate: false,
        invoice_now: false
      },
      { stripeAccount: organizationStripeAccountId }
    )
    ```
  - [ ] For end-of-period: use `update()` with `cancel_at_period_end: true`
  - [ ] Update subscription in database
  - [ ] Store cancellation reason/feedback (if provided)
  - [ ] Return updated subscription

- [ ] Handle errors
  - [ ] Subscription not found
  - [ ] Subscription already cancelled
  - [ ] Stripe API errors
  - [ ] Permission errors

### Frontend Tasks

- [ ] Update SubscriptionTab in `PortalContent.tsx`
  - [ ] Add "Cancel Subscription" button
  - [ ] Show only if subscription is active
  - [ ] Hide if already cancelled
  - [ ] Destructive styling (red button)

- [ ] Create `CancelSubscriptionModal` component
  - [ ] Import shadcn Dialog component
  - [ ] Modal title: "Cancel Subscription?"
  - [ ] Warning message about losing access
  - [ ] Timing radio buttons:
    - "Cancel immediately" (lose access now)
    - "Cancel at end of period" (access until [date])
  - [ ] Reason dropdown (optional):
    - Too expensive
    - Not using enough
    - Missing features
    - Found alternative
    - Other
  - [ ] Feedback textarea (optional)
  - [ ] Confirmation checkbox: "I understand I will lose access"
  - [ ] Action buttons:
    - "Cancel Subscription" (red, requires checkbox)
    - "Keep Subscription" (cancel modal)

- [ ] Implement cancel flow
  - [ ] Button click → open modal
  - [ ] Form validation (timing required, checkbox required)
  - [ ] Submit → API call to cancel endpoint
  - [ ] Success:
    - Close modal
    - Refresh portal data
    - Send `SUBSCRIPTION_CANCELLED` postMessage event
    - Show success toast
  - [ ] Error:
    - Display error message
    - Allow retry

- [ ] Update UI after cancellation
  - [ ] Show "Cancelled" status badge
  - [ ] Display cancellation date
  - [ ] Hide "Cancel" button
  - [ ] Show reactivation option (if end-of-period)

### Testing Checklist

- [ ] Backend cancellation works
  - [ ] Immediate cancel works
  - [ ] End-of-period cancel works
  - [ ] Reason/feedback saved
  - [ ] Stripe subscription updated

- [ ] Modal displays correctly
  - [ ] Opens on button click
  - [ ] All fields render
  - [ ] Timing options clear

- [ ] Form validation
  - [ ] Cannot submit without checkbox
  - [ ] Timing selection required

- [ ] Cancel flow works
  - [ ] Success refreshes data
  - [ ] postMessage event fires
  - [ ] Toast notification shows

- [ ] Error handling
  - [ ] Already cancelled → clear error
  - [ ] Stripe error → user-friendly message
  - [ ] Network error → retry option

- [ ] UI updates correctly
  - [ ] Status changes to "Cancelled"
  - [ ] Button disappears
  - [ ] Cancelled date shows

### Implementation Notes

_(To be filled during implementation)_

### Blockers

None currently

---

## Phase 3: Settings Tab ⏸️ Pending

**Goal:** Display and edit account details, show usage metrics for metered features

**Estimated Time:** 4-6 hours
**Complexity:** Medium (form handling + usage calculations)

### Backend Tasks

#### Account Details

- [ ] Create update endpoint in `portal.controller.ts`
  - [ ] Route: `PATCH /v1/portal/:sessionId/customer`
  - [ ] Accept DTO with customer fields

- [ ] Create DTO: `update-customer.dto.ts`
  ```typescript
  class UpdateCustomerDto {
    name?: string
    email?: string
    billingAddress?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
    }
  }
  ```

- [ ] Implement `updateCustomer()` in `portal.service.ts`
  - [ ] Validate portal session
  - [ ] Validate email format
  - [ ] Update customer in database
  - [ ] Update customer in Stripe:
    ```typescript
    await stripe.customers.update(
      stripeCustomerId,
      {
        name: dto.name,
        email: dto.email,
        address: dto.billingAddress
      },
      { stripeAccount }
    )
    ```
  - [ ] Return updated customer

#### Usage Tracking

- [ ] Implement `getUsageMetrics()` in `portal.service.ts`
  - [ ] Query usage_records table:
    ```sql
    SELECT feature_id, SUM(quantity) as used
    FROM usage_records
    WHERE customer_id = :customerId
    GROUP BY feature_id
    ```
  - [ ] Join with features table to get limits
  - [ ] Calculate percentage: `(used / limit) * 100`
  - [ ] Return array of usage metrics

- [ ] Update `getPortalData()` to include usage
  - [ ] Call `getUsageMetrics()`
  - [ ] Include in portal data response

- [ ] Create DTO for usage metrics
  ```typescript
  interface UsageMetric {
    featureId: string
    featureName: string
    used: number
    limit: number
    percentage: number
    unit: string
  }
  ```

### Frontend Tasks

#### Account Details Section

- [ ] Replace SettingsTab placeholder in `PortalContent.tsx`
  - [ ] Create form with customer fields
  - [ ] Pre-fill with existing data
  - [ ] Make fields editable

- [ ] Form fields:
  - [ ] Name input
  - [ ] Email input (with validation)
  - [ ] Billing address fields (collapsible?)
  - [ ] All using shadcn Form components

- [ ] Form handling:
  - [ ] Track dirty state
  - [ ] Enable save button when changed
  - [ ] Client-side validation
  - [ ] Submit → PATCH request
  - [ ] Success:
    - Refresh portal data
    - Show success toast
    - Reset dirty state
  - [ ] Error:
    - Display error message
    - Keep form data

#### Usage & Quotas Section

- [ ] Display usage metrics
  - [ ] List of features with usage
  - [ ] Progress bar for each feature
  - [ ] Color-coded:
    - Green: <70%
    - Yellow: 70-90%
    - Red: >90%
  - [ ] Show used/limit numbers
  - [ ] Unit display (requests, GB, seats, etc.)

- [ ] Warning badges
  - [ ] Show warning icon if >80% used
  - [ ] "Approaching limit" message

- [ ] Upgrade prompt
  - [ ] Show if any feature at 100%
  - [ ] "Upgrade to get more [feature]" CTA
  - [ ] Link to upgrade flow (future)

- [ ] Empty state
  - [ ] Show if no metered features
  - [ ] "No usage limits on your plan"

### Testing Checklist

- [ ] Customer update works
  - [ ] Name updates in database + Stripe
  - [ ] Email updates (with validation)
  - [ ] Billing address updates
  - [ ] Success toast shows

- [ ] Form validation
  - [ ] Invalid email → error message
  - [ ] Required fields enforced

- [ ] Usage metrics display
  - [ ] Fetches correctly from database
  - [ ] Progress bars accurate
  - [ ] Colors correct based on percentage
  - [ ] Units display correctly

- [ ] Empty states
  - [ ] No metered features → appropriate message

- [ ] Error handling
  - [ ] Stripe update fails → error shown
  - [ ] Network error → retry option

### Implementation Notes

_(To be filled during implementation)_

### Blockers

None currently

---

## Phase 4: Payment Methods ⏸️ Pending

**Goal:** Full CRUD for payment methods using Stripe Payment Element

**Estimated Time:** 8-12 hours
**Complexity:** High (Stripe.js integration, SetupIntent flow, 3D Secure)

### Backend Tasks

#### Fetch Payment Methods

- [ ] Payment methods already fetched in `getPortalData()`
  - [ ] Verify implementation correct
  - [ ] Ensure all fields included

#### Create SetupIntent

- [ ] New endpoint: `POST /v1/portal/:sessionId/setup-intent`
  - [ ] Create Stripe SetupIntent:
    ```typescript
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session'
      },
      { stripeAccount }
    )
    ```
  - [ ] Return `{ clientSecret: setupIntent.client_secret }`

#### Confirm Payment Method

- [ ] New endpoint: `POST /v1/portal/:sessionId/confirm-payment-method`
  - [ ] Accept: `{ setupIntentId: string }`
  - [ ] Retrieve SetupIntent from Stripe
  - [ ] Verify status === 'succeeded'
  - [ ] Get payment_method from setupIntent
  - [ ] Return payment method details

#### Detach Payment Method

- [ ] New endpoint: `DELETE /v1/portal/:sessionId/payment-methods/:paymentMethodId`
  - [ ] Validate ownership (PM belongs to portal customer)
  - [ ] Check not last PM if subscription active
  - [ ] Detach from Stripe:
    ```typescript
    await stripe.paymentMethods.detach(
      paymentMethodId,
      { stripeAccount }
    )
    ```
  - [ ] Return success

#### Set Default Payment Method

- [ ] New endpoint: `PATCH /v1/portal/:sessionId/default-payment-method`
  - [ ] Accept: `{ paymentMethodId: string }`
  - [ ] Validate ownership
  - [ ] Update customer in Stripe:
    ```typescript
    await stripe.customers.update(
      customerId,
      {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      },
      { stripeAccount }
    )
    ```
  - [ ] Update in database
  - [ ] Return updated customer

### Frontend Tasks

#### Payment Methods List

- [ ] Replace PaymentMethodsTab placeholder
  - [ ] Display saved payment methods as cards
  - [ ] Each card shows:
    - Brand icon (Visa, Mastercard, Amex, etc.)
    - Last 4 digits
    - Expiry date (MM/YY)
    - "Default" badge if default
    - Actions dropdown
  - [ ] Actions dropdown:
    - "Set as default" (if not default)
    - "Remove"
  - [ ] Empty state:
    - "No payment methods saved"
    - "Add Payment Method" CTA

- [ ] "Add Payment Method" button
  - [ ] Prominent at top of tab
  - [ ] Opens AddPaymentMethodModal

#### AddPaymentMethodModal Component

- [ ] Create new component file
  - [ ] Import shadcn Dialog
  - [ ] Modal title: "Add Payment Method"

- [ ] Load Stripe.js
  - [ ] Import `@stripe/stripe-js`
  - [ ] Load with publishable key:
    ```typescript
    const stripe = await loadStripe(publishableKey, {
      stripeAccount: organizationStripeAccountId
    })
    ```

- [ ] Create SetupIntent flow:
  - [ ] On modal open → call setup-intent endpoint
  - [ ] Receive client_secret
  - [ ] Create Elements instance:
    ```typescript
    const elements = stripe.elements({ clientSecret })
    ```

- [ ] Mount Payment Element
  - [ ] Create payment element:
    ```typescript
    const paymentElement = elements.create('payment', {
      layout: 'tabs'
    })
    ```
  - [ ] Mount to DOM: `paymentElement.mount('#payment-element')`

- [ ] Handle form submit
  - [ ] Disable submit while processing
  - [ ] Call confirmSetup:
    ```typescript
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href
      },
      redirect: 'if_required'
    })
    ```
  - [ ] If error → display error message
  - [ ] If setupIntent.status === 'succeeded':
    - Refresh payment methods
    - Close modal
    - Send PAYMENT_METHOD_ADDED event
    - Show success toast

- [ ] Handle 3D Secure
  - [ ] Stripe handles automatically
  - [ ] Show authentication modal
  - [ ] Handle redirect flow
  - [ ] Handle failures gracefully

#### Remove Payment Method Flow

- [ ] Confirmation dialog
  - [ ] "Remove card ending in [last4]?"
  - [ ] Warning if it's default
  - [ ] Confirm button

- [ ] Remove action
  - [ ] Call DELETE endpoint
  - [ ] Success:
    - Refresh payment methods
    - Send PAYMENT_METHOD_REMOVED event
    - Show success toast
  - [ ] Error:
    - Display error message

#### Set Default Flow

- [ ] Action from dropdown
  - [ ] Call PATCH endpoint
  - [ ] Success:
    - Refresh payment methods
    - Send PAYMENT_METHOD_UPDATED event
    - Show success toast
  - [ ] Error:
    - Display error message

### Stripe Integration

- [ ] Install dependencies
  - [ ] `npm install @stripe/stripe-js`
  - [ ] Import in iframe pages

- [ ] Get publishable key
  - [ ] Pass from backend via portal data?
  - [ ] Or environment variable?

- [ ] Handle Stripe account ID
  - [ ] Include in loadStripe call
  - [ ] Ensure all operations scoped to connected account

### Testing Checklist

- [ ] List displays correctly
  - [ ] Saved cards show
  - [ ] Brand icons correct
  - [ ] Default badge shows
  - [ ] Empty state works

- [ ] Add payment method
  - [ ] Modal opens
  - [ ] Payment Element loads
  - [ ] Form submits
  - [ ] Success adds card to list
  - [ ] postMessage event fires

- [ ] 3D Secure flow
  - [ ] Use test cards requiring authentication
  - [ ] Authentication modal appears
  - [ ] Success after auth
  - [ ] Failure after auth

- [ ] Remove payment method
  - [ ] Confirmation shows
  - [ ] Success removes from list
  - [ ] Cannot remove last card with active subscription

- [ ] Set default
  - [ ] Badge updates
  - [ ] Default changes in Stripe

- [ ] Error handling
  - [ ] Card declined → clear message
  - [ ] Network error → retry option
  - [ ] Invalid card → validation message

- [ ] Mobile responsive
  - [ ] Payment Element renders correctly
  - [ ] Modal usable on mobile
  - [ ] Card list readable

### Implementation Notes

_(To be filled during implementation)_

### Blockers

None currently

---

## Phase 5: Testing & Polish ⏸️ Pending

**Goal:** Comprehensive testing and final refinements

**Estimated Time:** 3-5 hours

### End-to-End Testing

- [ ] Test all features together
  - [ ] Navigate between tabs
  - [ ] Perform operations in sequence
  - [ ] Verify data consistency

- [ ] Test with different user scenarios
  - [ ] New customer (no data)
  - [ ] Active subscriber (full data)
  - [ ] Trial customer
  - [ ] Customer with failed payments

- [ ] Mobile responsiveness
  - [ ] Test on phone simulator
  - [ ] Test on tablet
  - [ ] Verify all features usable

- [ ] Browser compatibility
  - [ ] Chrome
  - [ ] Safari
  - [ ] Firefox
  - [ ] Mobile browsers

### Performance Testing

- [ ] Load times
  - [ ] Portal data fetch speed
  - [ ] Payment Element load time
  - [ ] Invoice list with many items

- [ ] Height adjustment
  - [ ] Verify smooth resizing
  - [ ] No jarring jumps

### Error Handling Review

- [ ] All features have error messages
- [ ] Error messages are user-friendly
- [ ] Retry options where appropriate
- [ ] Loading states during operations

### PostMessage Events

- [ ] Verify all events fire correctly:
  - [ ] PORTAL_READY
  - [ ] SUBSCRIPTION_UPDATED
  - [ ] SUBSCRIPTION_CANCELLED
  - [ ] PAYMENT_METHOD_ADDED
  - [ ] PAYMENT_METHOD_UPDATED
  - [ ] PAYMENT_METHOD_REMOVED
  - [ ] HEIGHT_CHANGED
  - [ ] ERROR

### Documentation

- [ ] Update final.md
  - [ ] Implementation summary
  - [ ] Lessons learned
  - [ ] Usage examples

- [ ] Create upgrade guide
  - [ ] What's new in V2
  - [ ] Breaking changes (if any)
  - [ ] Migration steps

### Deployment Checklist

- [ ] Environment variables set
  - [ ] Stripe publishable key
  - [ ] API URL configured

- [ ] Database migrations applied
  - [ ] Any new tables/columns

- [ ] Build succeeds
  - [ ] SDK compiles
  - [ ] Web app builds
  - [ ] API builds

- [ ] Smoke test in production
  - [ ] Create portal session
  - [ ] Load all tabs
  - [ ] Verify data loads

---

## Overall Progress

**Phases Completed:** 0/5 (0%)
**Current Focus:** Documentation Complete - Ready to Start Phase 1

### Summary

**Documentation:**
- ✅ plan.md created (comprehensive approach guide)
- ✅ progress.md created (this file)

**Implementation:**
- ⏸️ Phase 1: Invoices - Pending
- ⏸️ Phase 2: Cancellation - Pending
- ⏸️ Phase 3: Settings - Pending
- ⏸️ Phase 4: Payment Methods - Pending
- ⏸️ Phase 5: Testing & Polish - Pending

**Estimated Total Time:** 17-28 hours across all phases

---

## Key Decisions Tracker

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stripe Components | Custom UI with Payment Element | No pre-built components for Connect |
| Implementation Order | Invoices → Cancel → Settings → PM | Complexity progression (easy to hard) |
| SetupIntent Flow | Modern confirmation token approach | Stripe recommended, handles 3DS |
| Polar Reference | Use for all features | Proven implementation patterns |
| Mobile Strategy | Responsive components, no separate mobile view | Simpler maintenance |

---

## Blockers & Resolutions

**Current Blockers:** None

**Resolved Blockers:** None yet

---

## Open Questions

1. Should we limit number of invoices displayed? (pagination vs show all)
2. Should cancellation include retention offers in V2 or defer to V3?
3. Should we email customers after they cancel via portal?
4. Should we limit how many payment methods a customer can save?

---

## Next Steps

1. ✅ Complete documentation (plan.md + progress.md)
2. ➡️ **Begin Phase 1: Invoices Implementation**
   - Start with backend invoice fetching
   - Then frontend display
   - Test with real data

---

**Last Updated:** 2026-02-16
**Last Phase Completed:** None
**Next Milestone:** Complete Phase 1 (Invoices)
