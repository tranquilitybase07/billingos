# Payment Checkout Flow Test Cases

## Overview
This document outlines all test cases needed to ensure the payment checkout flow works correctly in production. These test cases cover session management, payment processing, subscription creation, and all edge cases identified in the implementation review.

## Test Categories

### 1. Session Token Management Tests

#### 1.1 Basic Session Token Generation
- **Setup**: Valid API key for organization
- **Action**: Call POST /v1/session-tokens with external user ID
- **Expected**:
  - Token format: `bos_session_{payload}.{signature}`
  - Valid JWT structure in payload
  - HMAC signature validates with secret
  - Expiry set correctly (default 1 hour)
  - Stored in session_tokens table

#### 1.2 Session Token with Custom Expiry
- **Setup**: Valid API key
- **Action**: Generate token with expiresIn: 7200 (2 hours)
- **Expected**: Token expires in 2 hours, not default 1 hour

#### 1.3 Invalid API Key
- **Setup**: Invalid or expired API key
- **Action**: Attempt to generate session token
- **Expected**: 401 Unauthorized error

#### 1.4 Expired Session Token Usage
- **Setup**: Session token expired 1 minute ago
- **Action**: Use token for checkout creation
- **Expected**: 401 error, "Session expired"

#### 1.5 Revoked Session Token
- **Setup**: Valid session token, then revoked
- **Action**: Use revoked token for API call
- **Expected**: 401 error, "Session invalid"

#### 1.6 Session Token Reuse Across Checkouts
- **Setup**: Single session token
- **Action**: Create multiple checkout sessions
- **Expected**: All succeed until token expires

#### 1.7 Concurrent Session Token Generation
- **Setup**: Same external user ID
- **Action**: Generate 5 tokens simultaneously
- **Expected**: All tokens valid, independent expiry

### 2. Product & Pricing Selection Tests

#### 2.1 Basic Product Selection
- **Setup**: Active product with monthly price ($50)
- **Action**: Create checkout with price ID
- **Expected**:
  - Checkout session created
  - Amount matches price (5000 cents)
  - Currency correct (USD)
  - Product details included

#### 2.2 Free Product Selection
- **Setup**: Free product (amount: 0)
- **Action**: Create checkout session
- **Expected**:
  - No payment intent created
  - Session marked as free in metadata
  - Confirm-free endpoint available

#### 2.3 Trial Product Selection
- **Setup**: Product with 14-day trial
- **Action**: Create checkout session
- **Expected**:
  - Trial period info in session
  - No immediate charge
  - Trial end date calculated

#### 2.4 Annual vs Monthly Pricing
- **Setup**: Product with both annual and monthly prices
- **Action**: Select annual price
- **Expected**:
  - Correct amount (annual total)
  - Interval shows "year"
  - Savings displayed if applicable

#### 2.5 Archived Product Selection
- **Setup**: Product marked as archived
- **Action**: Attempt checkout with archived product
- **Expected**: Error - "Product not available"

#### 2.6 Invisible Product Selection
- **Setup**: Product with visibility: false
- **Action**: Direct API call with price ID
- **Expected**: Product accessible via API (visibility only affects UI)

#### 2.7 Wrong Organization Product
- **Setup**: Product from different organization
- **Action**: Attempt checkout with wrong org's product
- **Expected**: Error - "Product not found"

#### 2.8 Deleted Price Selection
- **Setup**: Price soft-deleted but product active
- **Action**: Use deleted price ID
- **Expected**: Error - "Price not available"

### 3. Customer Information Tests

#### 3.1 New Customer Creation
- **Setup**: Email not in system
- **Action**: Checkout with new email
- **Expected**:
  - Customer created in database
  - Stripe customer created
  - Email/name stored correctly

#### 3.2 Existing Customer by Email
- **Setup**: Customer exists with email
- **Action**: Checkout with same email
- **Expected**:
  - Existing customer linked
  - Stripe customer ID reused
  - No duplicate created

#### 3.3 External User ID Linking
- **Setup**: Session with external user ID "user_123"
- **Action**: Complete checkout
- **Expected**:
  - Customer.external_user_id set
  - Can query customer by external ID

#### 3.4 Customer Information Update
- **Setup**: Existing customer, different name provided
- **Action**: Checkout with updated name
- **Expected**: Customer name updated in database

#### 3.5 Invalid Email Format
- **Setup**: Malformed email address
- **Action**: Create checkout
- **Expected**: Validation error - "Invalid email"

#### 3.6 Missing Required Fields
- **Setup**: No email provided
- **Action**: Create checkout
- **Expected**: Validation error - "Email required"

### 4. Payment Processing Tests

#### 4.1 Successful Card Payment
- **Setup**: Valid test card (4242...)
- **Action**: Complete payment flow
- **Expected**:
  - Payment intent succeeded
  - Webhook received
  - Subscription created
  - Customer charged

#### 4.2 Declined Card
- **Setup**: Decline test card (4000000000000002)
- **Action**: Attempt payment
- **Expected**:
  - Payment fails gracefully
  - Clear error message
  - No subscription created
  - Can retry with different card

#### 4.3 Insufficient Funds
- **Setup**: Insufficient funds card (4000000000009995)
- **Action**: Attempt payment
- **Expected**:
  - Specific error: "Insufficient funds"
  - Retry option available

#### 4.4 3D Secure Required
- **Setup**: 3DS test card (4000002500003155)
- **Action**: Complete payment with authentication
- **Expected**:
  - 3DS challenge presented
  - Payment succeeds after auth
  - Proper redirect flow

#### 4.5 3D Secure Failure
- **Setup**: 3DS card, fail authentication
- **Action**: Fail 3DS challenge
- **Expected**:
  - Payment fails
  - Clear error about authentication
  - Can retry

#### 4.6 Apple Pay Payment
- **Setup**: Apple Pay enabled browser/device
- **Action**: Pay with Apple Pay
- **Expected**:
  - Native Apple Pay sheet
  - Payment processes correctly
  - Subscription created

#### 4.7 Google Pay Payment
- **Setup**: Google Pay enabled
- **Action**: Pay with Google Pay
- **Expected**:
  - Google Pay flow completes
  - Payment succeeds

#### 4.8 Payment Method Saving
- **Setup**: New customer payment
- **Action**: Complete payment
- **Expected**:
  - Payment method saved to customer
  - Available for future payments
  - Can be set as default

### 5. Free Product Checkout Tests

#### 5.1 Basic Free Checkout
- **Setup**: Free product ($0)
- **Action**: Confirm free checkout
- **Expected**:
  - No payment required
  - Subscription created immediately
  - Features activated
  - No Stripe subscription

#### 5.2 Free to Paid Upgrade Path
- **Setup**: Customer on free plan
- **Action**: Upgrade to paid plan
- **Expected**:
  - Free subscription cancelled
  - Paid subscription created
  - Proper transition

#### 5.3 Multiple Free Products
- **Setup**: Multiple free products available
- **Action**: Subscribe to second free product
- **Expected**: Both subscriptions active (if allowed)

#### 5.4 Free Product with Trial
- **Setup**: Free product with trial period set
- **Action**: Checkout free product
- **Expected**: Trial ignored (free products don't need trials)

#### 5.5 Reactivate Cancelled Free
- **Setup**: Cancelled free subscription
- **Action**: Subscribe again to same free product
- **Expected**: Subscription reactivated

### 6. Trial Period Tests

#### 6.1 Basic Trial Activation
- **Setup**: Product with 14-day trial
- **Action**: Complete checkout
- **Expected**:
  - Subscription in trial
  - No immediate charge
  - Trial end date = now + 14 days
  - Features activated

#### 6.2 Trial with Immediate Charge
- **Setup**: Product with trial but requires setup fee
- **Action**: Complete checkout
- **Expected**:
  - Setup fee charged
  - Trial period active
  - Recurring starts after trial

#### 6.3 Trial End Conversion
- **Setup**: Trial ending today
- **Action**: Let trial expire
- **Expected**:
  - First payment charged
  - Subscription continues
  - Customer notified

#### 6.4 Trial Cancellation
- **Setup**: Active trial subscription
- **Action**: Cancel during trial
- **Expected**:
  - Immediate cancellation
  - No charge
  - Features deactivated

#### 6.5 Trial Extension
- **Setup**: Trial with 3 days left
- **Action**: Extend trial by 7 days
- **Expected**:
  - New trial end date
  - No charge yet
  - Notification sent

#### 6.6 Second Trial Prevention
- **Setup**: Customer had trial before
- **Action**: Try to get trial again
- **Expected**: No trial offered, immediate charge

### 7. Discount & Coupon Tests

#### 7.1 Percentage Discount
- **Setup**: 20% off coupon
- **Action**: Apply to $100 checkout
- **Expected**:
  - Price shows $80
  - Discount visible
  - Stripe coupon applied

#### 7.2 Fixed Amount Discount
- **Setup**: $10 off coupon
- **Action**: Apply to $50 checkout
- **Expected**:
  - Price shows $40
  - Minimum not violated

#### 7.3 Invalid Coupon Code
- **Setup**: Non-existent code "INVALID123"
- **Action**: Apply coupon
- **Expected**: Error - "Invalid coupon code"

#### 7.4 Expired Coupon
- **Setup**: Coupon expired yesterday
- **Action**: Apply coupon
- **Expected**: Error - "Coupon expired"

#### 7.5 Product-Specific Coupon
- **Setup**: Coupon valid only for Product A
- **Action**: Use on Product B
- **Expected**: Error - "Coupon not valid for this product"

#### 7.6 First-Time Customer Coupon
- **Setup**: New customer only coupon
- **Action**: Existing customer uses
- **Expected**: Error - "Coupon for new customers only"

#### 7.7 Coupon with Trial
- **Setup**: Product with trial, apply coupon
- **Action**: Complete checkout
- **Expected**:
  - Trial period honored
  - Discount applies after trial

#### 7.8 Multiple Coupon Attempt
- **Setup**: One coupon applied
- **Action**: Try to add second coupon
- **Expected**: Error - "Only one coupon allowed"

### 8. Subscription Creation Tests

#### 8.1 Basic Subscription Creation
- **Setup**: Successful payment
- **Action**: Webhook processes payment
- **Expected**:
  - Subscription created in DB
  - Status: active
  - Links to customer and product
  - Features granted

#### 8.2 Duplicate Subscription Prevention
- **Setup**: Customer has active subscription
- **Action**: Try to create same subscription
- **Expected**: Error - "Already subscribed to this product"

#### 8.3 Multiple Product Subscriptions
- **Setup**: Customer with Product A subscription
- **Action**: Subscribe to Product B
- **Expected**: Both subscriptions active

#### 8.4 Subscription Metadata
- **Setup**: Checkout with custom metadata
- **Action**: Complete subscription
- **Expected**: Metadata stored and retrievable

#### 8.5 Subscription Start Date
- **Setup**: Checkout completed at 3 PM
- **Action**: Check subscription
- **Expected**:
  - Start date = checkout time
  - Billing cycle from this time

#### 8.6 Annual Subscription Creation
- **Setup**: Annual plan payment
- **Action**: Create subscription
- **Expected**:
  - Interval: year
  - Next billing in 365 days

### 9. Webhook Processing Tests

#### 9.1 Payment Success Webhook
- **Setup**: payment_intent.succeeded event
- **Action**: Process webhook
- **Expected**:
  - Customer updated
  - Subscription created
  - Payment intent marked complete

#### 9.2 Webhook Signature Verification
- **Setup**: Invalid signature
- **Action**: Send webhook
- **Expected**: 400 error, webhook rejected

#### 9.3 Duplicate Webhook Handling
- **Setup**: Same webhook sent twice
- **Action**: Process both
- **Expected**: Idempotent, no duplicate subscription

#### 9.4 Out-of-Order Webhooks
- **Setup**: Send webhooks out of sequence
- **Action**: Process in wrong order
- **Expected**: System handles gracefully

#### 9.5 Webhook Retry on Failure
- **Setup**: Database temporarily down
- **Action**: Webhook fails
- **Expected**:
  - Stripe retries webhook
  - Eventually succeeds

#### 9.6 Unknown Event Type
- **Setup**: New Stripe event type
- **Action**: Receive webhook
- **Expected**: Log but don't fail

#### 9.7 Webhook for Wrong Account
- **Setup**: Webhook from different Stripe account
- **Action**: Process webhook
- **Expected**: Rejected, not our account

### 10. Concurrent Request Tests

#### 10.1 Double-Click Checkout
- **Setup**: User on checkout page
- **Action**: Click submit twice rapidly
- **Expected**: Only one payment processed

#### 10.2 Simultaneous Session Creation
- **Setup**: Same customer
- **Action**: Create 5 checkout sessions at once
- **Expected**: All sessions created, independent

#### 10.3 Race Condition: Payment vs Cancel
- **Setup**: Payment in progress
- **Action**: Try to cancel simultaneously
- **Expected**: First action wins, second fails

#### 10.4 Concurrent Customer Updates
- **Setup**: Customer being updated
- **Action**: Multiple simultaneous updates
- **Expected**: All updates apply, last write wins

#### 10.5 Parallel Webhook Processing
- **Setup**: Multiple webhooks arrive
- **Action**: Process in parallel
- **Expected**: All process correctly

### 11. Error Recovery Tests

#### 11.1 Network Timeout During Payment
- **Setup**: Payment request times out
- **Action**: Client retries
- **Expected**:
  - Idempotency prevents duplicate
  - Payment completes on retry

#### 11.2 Database Connection Lost
- **Setup**: DB connection drops mid-checkout
- **Action**: Attempt to continue
- **Expected**:
  - Graceful error
  - Can retry when DB returns

#### 11.3 Stripe API Outage
- **Setup**: Stripe returns 500 errors
- **Action**: Attempt checkout
- **Expected**:
  - User-friendly error
  - Suggest retry later
  - No partial state

#### 11.4 Partial Failure Recovery
- **Setup**: Payment succeeds, subscription create fails
- **Action**: Webhook retries
- **Expected**:
  - Subscription eventually created
  - Customer not double-charged

#### 11.5 Session Expiry During Checkout
- **Setup**: Session expires while user entering card
- **Action**: Submit payment
- **Expected**:
  - Clear expiry message
  - Can generate new session

### 12. Platform & Integration Tests

#### 12.1 Stripe Connect Fee Calculation
- **Setup**: $100 payment
- **Action**: Complete checkout
- **Expected**:
  - 5% platform fee ($5)
  - Merchant receives $95
  - Fee tracked in payment_intents

#### 12.2 Connected Account Verification
- **Setup**: Unverified Stripe account
- **Action**: Process payment
- **Expected**: Payment holds until verified

#### 12.3 Multi-Currency Support
- **Setup**: Product in EUR
- **Action**: Checkout from US
- **Expected**:
  - Price shown in EUR
  - Card charged in EUR
  - Conversion handled by card issuer

#### 12.4 Transfer Timing
- **Setup**: Successful payment
- **Action**: Check transfer schedule
- **Expected**: Transfer scheduled per platform settings

### 13. SDK & Iframe Integration Tests

#### 13.1 Basic Iframe Checkout
- **Setup**: Embed checkout in iframe
- **Action**: Complete payment
- **Expected**:
  - PostMessage communication works
  - Success event received
  - Parent window can react

#### 13.2 Cross-Origin Communication
- **Setup**: Checkout on different domain
- **Action**: Send/receive messages
- **Expected**:
  - CORS headers correct
  - Messages validated
  - Origin checked

#### 13.3 Iframe Resize Handling
- **Setup**: Checkout content changes height
- **Action**: Content expands
- **Expected**: Iframe resizes automatically

#### 13.4 SDK Session Management
- **Setup**: SDK initialized with session token
- **Action**: Token expires during checkout
- **Expected**:
  - SDK requests new token
  - Checkout continues

#### 13.5 Mobile Iframe Behavior
- **Setup**: Iframe on mobile device
- **Action**: Complete checkout
- **Expected**:
  - Responsive layout
  - Touch events work
  - Keyboard doesn't break layout

#### 13.6 Popup Blocker Handling
- **Setup**: Popup blocker enabled
- **Action**: Try to open checkout
- **Expected**:
  - Fallback to inline iframe
  - User notified if needed

### 14. Security Tests

#### 14.1 SQL Injection Attempts
- **Setup**: Malicious input in fields
- **Action**: Submit '; DROP TABLE--
- **Expected**: Input sanitized, no damage

#### 14.2 XSS Prevention
- **Setup**: Script tags in customer name
- **Action**: Submit <script>alert(1)</script>
- **Expected**: Escaped properly, no execution

#### 14.3 CSRF Protection
- **Setup**: Forged request from different origin
- **Action**: Attempt checkout creation
- **Expected**: Request rejected

#### 14.4 Rate Limiting
- **Setup**: Same IP/session
- **Action**: 100 requests in 1 minute
- **Expected**: Rate limited after threshold

#### 14.5 Token Signature Tampering
- **Setup**: Valid session token
- **Action**: Modify payload, keep signature
- **Expected**: Signature validation fails

#### 14.6 Replay Attack Prevention
- **Setup**: Capture valid request
- **Action**: Replay same request
- **Expected**: Idempotency prevents duplicate

#### 14.7 Information Disclosure
- **Setup**: Invalid request
- **Action**: Trigger various errors
- **Expected**: No sensitive data in errors

### 15. Performance & Scale Tests

#### 15.1 Checkout Creation Speed
- **Setup**: Normal conditions
- **Action**: Create checkout session
- **Expected**: < 200ms response time

#### 15.2 Payment Processing Time
- **Setup**: Card payment
- **Action**: Complete payment flow
- **Expected**: < 3 seconds total

#### 15.3 Concurrent Checkouts
- **Setup**: 50 simultaneous checkouts
- **Action**: All complete payment
- **Expected**:
  - All succeed
  - No timeouts
  - < 5s each

#### 15.4 Database Query Performance
- **Setup**: 10K products in database
- **Action**: Query available products
- **Expected**: < 100ms response

#### 15.5 Webhook Processing Load
- **Setup**: 20 webhooks per second
- **Action**: Process all webhooks
- **Expected**:
  - All processed
  - < 500ms each
  - No queue backup

#### 15.6 Session Cleanup Performance
- **Setup**: 1000 expired sessions
- **Action**: Run cleanup job
- **Expected**: Completes in < 5 seconds

### 16. UI/UX Tests

#### 16.1 Loading State Display
- **Setup**: Slow network (3G)
- **Action**: Load checkout page
- **Expected**:
  - Loading indicators shown
  - No layout shift
  - Graceful progressive load

#### 16.2 Error Message Clarity
- **Setup**: Various error conditions
- **Action**: Trigger errors
- **Expected**:
  - User-friendly messages
  - Clear next steps
  - No technical jargon

#### 16.3 Mobile Responsiveness
- **Setup**: Various mobile devices
- **Action**: Complete checkout
- **Expected**:
  - All elements accessible
  - No horizontal scroll
  - Touch targets adequate

#### 16.4 Accessibility Compliance
- **Setup**: Screen reader
- **Action**: Navigate checkout
- **Expected**:
  - All fields labeled
  - ARIA attributes present
  - Keyboard navigable

#### 16.5 Browser Compatibility
- **Setup**: Different browsers
- **Action**: Test checkout flow
- **Expected**: Works on Chrome, Safari, Firefox, Edge

### 17. Customer Portal Tests

#### 17.1 Portal Session Creation
- **Setup**: Active subscription
- **Action**: Create portal session
- **Expected**:
  - Secure session created
  - Limited time validity
  - Customer data accessible

#### 17.2 View Subscription Details
- **Setup**: Portal session active
- **Action**: View subscription
- **Expected**:
  - Current plan shown
  - Next billing date
  - Payment history

#### 17.3 Update Payment Method
- **Setup**: Expired card on file
- **Action**: Update card in portal
- **Expected**:
  - New card saved
  - Old card removed
  - Stripe customer updated

#### 17.4 Cancel Subscription
- **Setup**: Active subscription
- **Action**: Cancel via portal
- **Expected**:
  - Cancel at period end
  - Confirmation email
  - Can reactivate

#### 17.5 Download Invoices
- **Setup**: Past invoices exist
- **Action**: Download invoice PDF
- **Expected**:
  - PDF generated
  - Correct details
  - Professional format

### 18. Monitoring & Observability Tests

#### 18.1 Metrics Collection
- **Setup**: Checkout flow active
- **Action**: Monitor metrics
- **Expected**:
  - Conversion rate tracked
  - Error rate measured
  - Response times logged

#### 18.2 Error Alerting
- **Setup**: Payment failures spike
- **Action**: 10 failures in 5 minutes
- **Expected**:
  - Alert triggered
  - Team notified
  - Details provided

#### 18.3 Audit Trail Completeness
- **Setup**: Various checkout actions
- **Action**: Review audit logs
- **Expected**:
  - All actions logged
  - User/session tracked
  - Timestamps accurate

#### 18.4 Debug Information
- **Setup**: Checkout fails
- **Action**: Check logs
- **Expected**:
  - Error details logged
  - Request/response captured
  - Stack trace if applicable

## Test Execution Priority

### Critical (Must Pass Before Production)
- All Session Token tests (1.x)
- Basic payment processing (4.1, 4.2)
- Free product checkout (5.1)
- Subscription creation (8.1, 8.2)
- Webhook processing (9.1, 9.2, 9.3)
- Security tests (14.x)
- Platform fee calculation (12.1)

### High (Should Pass Before Beta)
- Trial period tests (6.x)
- Discount/coupon tests (7.x)
- Customer management (3.x)
- Error recovery (11.x)
- SDK integration (13.x)

### Medium (Can Fix During Beta)
- Payment method varieties (4.6, 4.7)
- Portal functionality (17.x)
- Performance tests (15.x)
- UI/UX tests (16.x)

### Low (Post-Launch Optimization)
- Advanced monitoring (18.x)
- Scale tests (15.x)
- Browser compatibility (16.5)

## Automation Strategy

### Unit Tests Required
```javascript
// Session token generation and validation
describe('SessionTokenService', () => {
  test('generates valid token format')
  test('signature validates correctly')
  test('expiry time calculation')
  test('token revocation')
})

// Price calculation
describe('PricingService', () => {
  test('calculates platform fees')
  test('applies discounts correctly')
  test('handles currency conversion')
  test('trial period calculation')
})
```

### Integration Tests Required
```javascript
// Checkout API flow
describe('Checkout API', () => {
  test('complete checkout flow')
  test('free product checkout')
  test('trial subscription creation')
  test('webhook processing')
})

// Stripe integration
describe('Stripe Integration', () => {
  test('payment intent creation')
  test('customer creation')
  test('subscription management')
  test('webhook signature verification')
})
```

### E2E Tests Required
```javascript
// Full checkout flow
describe('E2E Checkout', () => {
  test('new customer paid checkout')
  test('existing customer checkout')
  test('free product activation')
  test('trial to paid conversion')
  test('checkout with discount')
})
```

### Manual Testing Required
- Payment provider specific flows (Apple Pay, Google Pay)
- 3D Secure authentication flows
- Mobile device testing
- Accessibility testing
- Cross-browser compatibility

## Success Criteria

### Functional Requirements
- ✅ 100% of critical tests passing
- ✅ 95% of high priority tests passing
- ✅ Zero data loss or corruption
- ✅ No duplicate charges possible
- ✅ All payment methods working

### Performance Requirements
- ✅ Checkout session creation < 200ms (p95)
- ✅ Payment processing < 3s (p95)
- ✅ Webhook processing < 500ms (p95)
- ✅ 99.9% uptime for checkout flow

### Security Requirements
- ✅ PCI compliance maintained
- ✅ All inputs validated and sanitized
- ✅ Session tokens cryptographically secure
- ✅ No sensitive data in logs
- ✅ HTTPS enforced everywhere

### User Experience Requirements
- ✅ Mobile responsive checkout
- ✅ Clear error messages
- ✅ Accessibility WCAG 2.1 AA compliant
- ✅ Works on major browsers
- ✅ Graceful degradation on errors

## Test Data Setup

### Test Cards (Stripe)
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Insufficient: 4000 0000 0000 9995
3D Secure: 4000 0025 0000 3155
```

### Test Customers
```
new-customer@test.com - No previous subscriptions
existing-paid@test.com - Has active paid subscription
existing-free@test.com - Has free subscription
churned@test.com - Had subscription, cancelled
trial@test.com - Currently in trial period
```

### Test Products
```
free-product - $0/month
basic-product - $29/month
pro-product - $99/month, 14-day trial
enterprise-product - $299/month, annual only
```

### Test Coupons
```
WELCOME20 - 20% off, new customers only
SAVE10 - $10 off, any product
TRIAL30 - 30-day trial extension
EXPIRED - Expired coupon for testing
```

## Monitoring & Alerting

### Key Metrics to Track
- Checkout conversion rate (target: >70%)
- Payment success rate (target: >95%)
- Average checkout time (target: <30s)
- Session token generation rate
- Webhook processing lag (target: <1s)
- Error rate by type

### Alert Thresholds
- Payment success rate < 90% (15 min window)
- Checkout creation errors > 5% (5 min window)
- Webhook processing lag > 5s
- Session token failures > 10/minute
- Database connection errors > 3/minute

### Dashboards Required
- Real-time checkout funnel
- Payment method success rates
- Error breakdown by type
- Geographic performance
- Customer journey tracking

## Production Readiness Checklist

### Pre-Launch Requirements
- [ ] All critical tests passing
- [ ] Security audit completed
- [ ] Load testing completed
- [ ] Error handling verified
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Documentation complete
- [ ] Support team trained
- [ ] Rollback plan ready
- [ ] Feature flags configured