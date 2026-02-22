# Subscription Upgrade/Downgrade Test Cases

## Overview
This document outlines all test cases needed to ensure the subscription upgrade/downgrade feature works correctly in production. These test cases are derived from the code review and identified edge cases.

## Test Categories

### 1. Free to Paid Upgrade Tests

#### 1.1 Basic Free to Paid Upgrade
- **Setup**: Customer on free plan with no Stripe subscription
- **Action**: Upgrade to paid plan ($50/month)
- **Expected**:
  - Free subscription cancelled
  - New paid subscription created in Stripe
  - Trial applied if eligible
  - Features updated correctly
  - Single active subscription in database

#### 1.2 Free to Paid with Existing Trial
- **Setup**: Customer on free plan, previously had trial
- **Action**: Upgrade to paid plan
- **Expected**: No trial applied, immediate charge

#### 1.3 Free to Paid with Multiple Free Plans
- **Setup**: Customer has multiple free subscriptions (shouldn't happen but test defense)
- **Action**: Upgrade to paid
- **Expected**: All free subscriptions cancelled, single paid created

### 2. Paid to Paid Upgrade Tests

#### 2.1 Monthly to Higher Monthly
- **Setup**: Customer on $50/month plan
- **Action**: Upgrade to $100/month plan
- **Expected**:
  - Proper proration calculated
  - Old subscription item replaced (not duplicated)
  - Immediate charge for difference
  - No duplicate subscriptions

#### 2.2 Annual to Higher Annual
- **Setup**: Customer on $500/year plan, 4 months in
- **Action**: Upgrade to $1000/year plan
- **Expected**:
  - Proration for remaining 8 months
  - Charge = ($1000 * 8/12) - ($500 * 8/12) = $333.34

#### 2.3 Same Price "Upgrade"
- **Setup**: Customer on $50/month plan
- **Action**: Try to upgrade to same $50/month plan
- **Expected**: Error - "Already on this plan"

#### 2.4 Different Billing Interval Upgrade
- **Setup**: Customer on $50/month plan
- **Action**: Upgrade to $500/year plan
- **Expected**: Proper conversion and proration

### 3. Downgrade Tests

#### 3.1 Basic Downgrade
- **Setup**: Customer on $100/month plan
- **Action**: Downgrade to $50/month plan
- **Expected**:
  - Change scheduled for period end
  - Customer stays on current plan until then
  - Email notification sent
  - Change visible in UI

#### 3.2 Downgrade Execution at Period End
- **Setup**: Scheduled downgrade from previous test
- **Action**: Period end reached
- **Expected**:
  - Downgrade automatically applied
  - New subscription at lower price
  - Features updated
  - Customer notified

#### 3.3 Cancel Pending Downgrade
- **Setup**: Scheduled downgrade
- **Action**: Customer cancels before period end
- **Expected**: Downgrade cancelled, stays on current plan

### 4. Concurrency & Race Condition Tests

#### 4.1 Double-Click Upgrade
- **Setup**: Customer on $50/month plan
- **Action**: Click upgrade button twice rapidly
- **Expected**: Only one upgrade processed, second rejected

#### 4.2 Simultaneous API Calls
- **Setup**: Customer on paid plan
- **Action**: Send 5 concurrent upgrade API requests
- **Expected**: Only first succeeds, others fail with lock error

#### 4.3 Webhook vs API Race
- **Setup**: Upgrade in progress
- **Action**: Stripe webhook arrives before API completes
- **Expected**: Consistent state, no data corruption

### 5. Edge Cases & Error Handling

#### 5.1 Upgrade During Trial
- **Setup**: Customer on paid trial (day 3 of 14)
- **Action**: Upgrade to higher plan
- **Expected**: Trial preserved on new plan, no immediate charge

#### 5.2 Downgrade During Trial
- **Setup**: Customer on paid trial
- **Action**: Downgrade to lower plan
- **Expected**: Trial preserved, downgrade at trial end

#### 5.3 Upgrade with Pending Downgrade
- **Setup**: Downgrade scheduled for period end
- **Action**: Upgrade before downgrade executes
- **Expected**: Downgrade cancelled, immediate upgrade

#### 5.4 Payment Failure on Upgrade
- **Setup**: Customer with failing payment method
- **Action**: Attempt upgrade
- **Expected**:
  - Upgrade rejected
  - Original subscription unchanged
  - Clear error message

#### 5.5 Stripe API Down
- **Setup**: Stripe API returns 500 errors
- **Action**: Attempt upgrade
- **Expected**:
  - Graceful failure
  - Database not modified
  - User-friendly error

#### 5.6 Deleted Product Upgrade
- **Setup**: Try to upgrade to soft-deleted product
- **Action**: Select deleted product
- **Expected**: Product not available, clear error

#### 5.7 Currency Mismatch
- **Setup**: Current plan in USD
- **Action**: Try to upgrade to EUR plan
- **Expected**: Error - "Cannot change currencies"

### 6. Proration Calculation Tests

#### 6.1 Mid-Month Upgrade
- **Setup**: $30/month plan, day 15 of 30
- **Action**: Upgrade to $60/month
- **Expected**:
  - Unused credit: $30 * 15/30 = $15
  - New charge: $60 * 15/30 = $30
  - Amount due: $30 - $15 = $15

#### 6.2 Last Day of Period Upgrade
- **Setup**: Day 30 of 30
- **Action**: Upgrade
- **Expected**: Minimal or no proration

#### 6.3 First Day of Period Upgrade
- **Setup**: Day 1 of 30
- **Action**: Upgrade
- **Expected**: Full month difference charged

#### 6.4 Leap Year Calculation
- **Setup**: February billing in leap year
- **Action**: Upgrade mid-month
- **Expected**: Correct day count (29 days)

### 7. Authorization & Security Tests

#### 7.1 Non-Admin Upgrade Attempt
- **Setup**: Organization member (not admin)
- **Action**: Try to upgrade subscription
- **Expected**: Forbidden error

#### 7.2 Wrong Organization Access
- **Setup**: User from Organization A
- **Action**: Try to upgrade Organization B's subscription
- **Expected**: Forbidden error

#### 7.3 SDK with Invalid Token
- **Setup**: SDK request with expired/invalid session token
- **Action**: Attempt upgrade
- **Expected**: Unauthorized error

#### 7.4 CSRF Protection
- **Setup**: Cross-origin request
- **Action**: Attempt upgrade
- **Expected**: Request blocked

### 8. Feature & Entitlement Tests

#### 8.1 Feature Grant on Upgrade
- **Setup**: Upgrade to plan with more features
- **Action**: Complete upgrade
- **Expected**: New features immediately accessible

#### 8.2 Feature Revocation on Downgrade
- **Setup**: Downgrade to plan with fewer features
- **Action**: Downgrade executes
- **Expected**: Premium features no longer accessible

#### 8.3 Usage Limits Update
- **Setup**: Plan with different API limits
- **Action**: Upgrade/downgrade
- **Expected**: Limits updated correctly

### 9. UI/UX Tests

#### 9.1 Preview Accuracy
- **Setup**: Any upgrade scenario
- **Action**: View preview
- **Expected**: Preview matches actual charge

#### 9.2 Loading States
- **Setup**: Slow network
- **Action**: Initiate upgrade
- **Expected**: Proper loading indicators, no double-submit

#### 9.3 Error Display
- **Setup**: Various error conditions
- **Action**: Trigger errors
- **Expected**: User-friendly error messages

#### 9.4 Mobile Responsiveness
- **Setup**: Mobile device
- **Action**: Use upgrade flow
- **Expected**: All UI elements accessible and functional

### 10. Integration Tests

#### 10.1 Webhook Processing
- **Setup**: Successful upgrade
- **Action**: Stripe sends webhook
- **Expected**: Local database synced correctly

#### 10.2 Invoice Generation
- **Setup**: Upgrade with proration
- **Action**: Complete upgrade
- **Expected**: Invoice created with correct line items

#### 10.3 Email Notifications
- **Setup**: Various upgrade/downgrade scenarios
- **Action**: Complete actions
- **Expected**: Appropriate emails sent

#### 10.4 Audit Trail
- **Setup**: Any change
- **Action**: Complete change
- **Expected**: Change recorded in subscription_changes table

### 11. Performance & Scale Tests

#### 11.1 Bulk Upgrades
- **Setup**: 100 customers
- **Action**: All upgrade simultaneously
- **Expected**: All complete within SLA, no timeouts

#### 11.2 Large Proration Calculation
- **Setup**: Complex subscription with many line items
- **Action**: Calculate proration
- **Expected**: Completes in <200ms

#### 11.3 Database Query Performance
- **Setup**: 1M subscriptions in database
- **Action**: Query available plans
- **Expected**: Returns in <100ms

### 12. Recovery & Rollback Tests

#### 12.1 Partial Failure Recovery
- **Setup**: Database update succeeds, Stripe fails
- **Action**: Attempt upgrade
- **Expected**: Database rolled back, consistent state

#### 12.2 Idempotency
- **Setup**: Network timeout after request sent
- **Action**: Client retries request
- **Expected**: No duplicate charges or changes

#### 12.3 Manual Rollback
- **Setup**: Incorrect upgrade applied
- **Action**: Admin manually reverts
- **Expected**: Clean rollback possible

## Test Execution Priority

### Critical (Must Pass Before Production)
- All Free to Paid tests (1.x)
- Basic Paid to Paid upgrade (2.1)
- Concurrency tests (4.x)
- Payment failure handling (5.4)
- Authorization tests (7.x)

### High (Should Pass Before Beta)
- Downgrade tests (3.x)
- Proration calculations (6.x)
- Feature management (8.x)
- Webhook integration (10.1)

### Medium (Can Fix During Beta)
- Edge cases (5.x)
- UI/UX tests (9.x)
- Performance tests (11.x)

### Low (Post-Launch Optimization)
- Recovery tests (12.x)
- Scale tests (11.x)

## Automation Strategy

### Unit Tests
- Proration calculations
- State transitions
- Authorization logic
- Feature flag checks

### Integration Tests
- API endpoint flows
- Stripe API interactions
- Database transactions
- Webhook processing

### E2E Tests
- Complete upgrade flow
- Complete downgrade flow
- Preview to completion flow
- Error recovery flows

### Manual Tests
- UI responsiveness
- Email content verification
- Complex edge cases
- Performance under load

## Success Criteria

- **Zero Data Loss**: No subscriptions lost or duplicated
- **100% Proration Accuracy**: All calculations match Stripe
- **No Double Charging**: Each customer charged exactly once
- **Atomic Operations**: All changes fully succeed or fully fail
- **Clear Errors**: Users understand what went wrong
- **Fast Response**: <200ms for preview, <1s for execution
- **Audit Complete**: Every change tracked and reversible