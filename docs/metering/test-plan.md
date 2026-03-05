# BillingOS Metering API Test Plan

## Executive Summary

This document provides comprehensive test coverage for the BillingOS metering/usage tracking system. BillingOS provides a **usage tracking and quota enforcement service** that helps merchants monitor their customers' consumption of resources like API calls, AI tokens, and storage.

**Important**: BillingOS is NOT a metered billing system in Phase 1. It tracks usage and enforces limits but does not calculate bills based on consumption.

## System Purpose (Phase 1)

### What BillingOS Metering Does:
- **Tracks** customer usage of metered resources (API calls, AI tokens, etc.)
- **Enforces** hard quota limits (blocks access when exceeded)
- **Provides** usage data via SDK hooks for merchant UIs
- **Displays** usage metrics in customer portal
- **Sends** email notifications to customers approaching/exceeding limits
- **Offers** analytics dashboard for merchants to view usage patterns

### What BillingOS Metering Does NOT Do (Phase 1):
- Does NOT calculate usage-based bills
- Does NOT charge overage fees
- Does NOT send usage data to Stripe for billing
- Does NOT generate invoices with consumption charges

---

## Implementation Status by Phase

### ✅ Phase 1: Implemented Features
- Usage quota tracking with atomic increments
- Hard blocking when quotas exceeded
- Period-based usage tracking (billing cycle aligned)
- SDK integration with React Query hooks
- Session token authentication for SDK endpoints
- Customer portal usage display
- Customer entitlement checking with usage data

### 🚧 Phase 1: Missing Features (Priority)

1. **Customer Email Notifications** (HIGH PRIORITY)
   - No emails when approaching limits (80%, 90%)
   - No email when quota exceeded
   - No usage summary emails
   - Impact: Poor customer experience, unexpected blocks

2. **Merchant Analytics Dashboard** (HIGH PRIORITY)
   - `MetersPage.tsx` is empty skeleton
   - No aggregate usage view across customers
   - No usage trends or adoption metrics
   - Impact: Merchants blind to usage patterns

3. **Idempotency Protection** (MEDIUM PRIORITY)
   - Code commented out in features.service.ts
   - Risk: Duplicate usage tracking
   - Impact: Incorrect usage data

4. **Rate Limiting** (MEDIUM PRIORITY)
   - No rate limiting on tracking endpoints
   - Risk: API abuse, DoS attacks
   - Impact: System stability

5. **Redis Caching** (LOW PRIORITY)
   - Multiple TODOs in code
   - Current: Every check hits database
   - Impact: Performance at scale

### ⏭️ Phase 2: Future Features (Not in Scope)

These features are for future metered billing implementation:

1. **Usage-Based Billing**
   - Calculate charges based on consumption
   - Overage pricing and tier-based rates
   - Generate invoices with usage line items

2. **Stripe Metering Integration**
   - Send usage events to Stripe
   - Stripe-calculated usage bills
   - Webhook processing for billing events

3. **Merchant Alert Configuration**
   - Configurable threshold alerts
   - Webhook endpoints for merchants
   - Slack/email notifications to merchants

4. **Advanced Feature Types**
   - Boolean flag usage tracking
   - Numeric limit enforcement
   - Composite feature bundles

5. **Automatic Period Management**
   - Auto-create new period records
   - Cron jobs for period resets
   - Usage rollover policies

---

## Test Suite Organization by Phase

### Phase 1 Tests (Current Priority)
```
Core Functionality:
1. Database Layer Tests
2. Usage Tracking Service Tests
3. Quota Enforcement Tests
4. SDK Integration Tests
5. Customer Portal Tests
6. Email Notification Tests (TO IMPLEMENT)
7. Merchant Dashboard Tests (TO IMPLEMENT)
8. End-to-End Usage Flows
9. Security & Performance Tests
```

### Phase 2 Tests (Future)
```
Billing Features:
1. Usage-Based Pricing Calculations
2. Stripe Metering Integration
3. Invoice Generation with Usage
4. Overage Handling
5. Merchant Webhook Notifications
6. Advanced Feature Types (Boolean, Numeric)
```

---

## Phase 1: Detailed Test Cases

### 1. Database Layer Tests

```javascript
describe('Database: usage_records table', () => {
  describe('Schema Constraints', () => {
    it('should enforce unique constraint on (customer_id, feature_id, period_start)', async () => {
      // Given: An existing usage record for customer-1, feature-1, period 2024-01-01
      const existingRecord = {
        customer_id: 'customer-1',
        feature_id: 'feature-1',
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2024-02-01T00:00:00Z',
        consumed_units: 100
      };

      // When: Attempting to insert duplicate record
      const duplicateRecord = { ...existingRecord };

      // Then: Database should throw unique constraint violation
      expect(insertRecord(duplicateRecord)).rejects.toThrow('duplicate key value violates unique constraint');
    });

    it('should enforce period_end > period_start constraint', async () => {
      // Given: Invalid period with end before start
      const invalidRecord = {
        customer_id: 'customer-1',
        feature_id: 'feature-1',
        period_start: '2024-02-01T00:00:00Z',
        period_end: '2024-01-01T00:00:00Z',
        consumed_units: 0
      };

      // When: Attempting to insert
      // Then: Should throw check constraint violation
      expect(insertRecord(invalidRecord)).rejects.toThrow('check constraint "usage_records_period_check"');
    });

    it('should allow NULL limit_units for unlimited features', async () => {
      // Given: Usage record with no limit
      const unlimitedRecord = {
        customer_id: 'customer-1',
        feature_id: 'feature-unlimited',
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2024-02-01T00:00:00Z',
        consumed_units: 999999,
        limit_units: null
      };

      // When: Inserting record
      const result = await insertRecord(unlimitedRecord);

      // Then: Should succeed with NULL limit
      expect(result.limit_units).toBeNull();
      expect(result.consumed_units).toBe(999999);
    });

    it('should support fractional units with DECIMAL(20,6) precision', async () => {
      // Given: Usage with fractional units (e.g., 0.000001 AI tokens)
      const fractionalRecord = {
        customer_id: 'customer-1',
        feature_id: 'ai-tokens',
        consumed_units: 1234.567891,
        limit_units: 10000.000000
      };

      // When: Storing and retrieving
      const result = await insertAndFetch(fractionalRecord);

      // Then: Should maintain 6 decimal precision
      expect(result.consumed_units).toBe('1234.567891');
      expect(result.limit_units).toBe('10000.000000');
    });
  });

  describe('RLS Policies', () => {
    it('should prevent cross-organization data access', async () => {
      // Given: User from organization-1
      const user1Context = { organization_id: 'org-1' };

      // When: Attempting to read organization-2's usage
      const query = `SELECT * FROM usage_records WHERE organization_id = 'org-2'`;

      // Then: Should return empty result set
      expect(executeAs(user1Context, query)).resolves.toHaveLength(0);
    });
  });
});
```

### 2. API Service Layer Tests

```javascript
describe('FeaturesService', () => {
  describe('trackUsage()', () => {
    it('should atomically increment consumed_units', async () => {
      // Given: Existing usage record with 100 consumed units
      const customerId = 'customer-1';
      const featureKey = 'api-calls';
      const existingUsage = 100;
      await createUsageRecord({
        customer_id: customerId,
        feature_key: featureKey,
        consumed_units: existingUsage,
        limit_units: 1000
      });

      // When: Two concurrent track requests for 10 units each
      const promise1 = featuresService.trackUsage({
        customer_id: customerId,
        feature_key: featureKey,
        quantity: 10
      });

      const promise2 = featuresService.trackUsage({
        customer_id: customerId,
        feature_key: featureKey,
        quantity: 10
      });

      await Promise.all([promise1, promise2]);

      // Then: Should have exactly 120 units (no race condition)
      const result = await getUsageRecord(customerId, featureKey);
      expect(result.consumed_units).toBe(120);
    });

    it('should throw quota_exceeded when limit reached', async () => {
      // Given: Usage at limit (1000/1000)
      const customerId = 'customer-1';
      await createUsageRecord({
        customer_id: customerId,
        feature_key: 'api-calls',
        consumed_units: 1000,
        limit_units: 1000
      });

      // When: Attempting to track 1 more unit
      const trackPromise = featuresService.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 1
      });

      // Then: Should throw quota_exceeded error
      await expect(trackPromise).rejects.toThrow('Quota exceeded for feature api-calls');
      await expect(trackPromise).rejects.toMatchObject({
        code: 'quota_exceeded',
        statusCode: 429
      });
    });

    it('should create usage record if not exists for current period', async () => {
      // Given: No usage record exists for current period
      const customerId = 'customer-new';
      const featureKey = 'api-calls';
      const currentPeriod = getCurrentBillingPeriod(customerId);

      // When: Tracking first usage
      const result = await featuresService.trackUsage({
        customer_id: customerId,
        feature_key: featureKey,
        quantity: 5
      });

      // Then: Should create record with correct period
      expect(result.success).toBe(true);
      const record = await getUsageRecord(customerId, featureKey);
      expect(record.consumed_units).toBe(5);
      expect(record.period_start).toBe(currentPeriod.start);
      expect(record.period_end).toBe(currentPeriod.end);
    });

    it('should validate feature exists and is usage_quota type', async () => {
      // Given: Boolean flag feature (not usage_quota)
      const customerId = 'customer-1';
      const booleanFeature = 'premium-support';

      // When: Attempting to track usage
      const trackPromise = featuresService.trackUsage({
        customer_id: customerId,
        feature_key: booleanFeature,
        quantity: 1
      });

      // Then: Should throw validation error
      await expect(trackPromise).rejects.toThrow('Feature premium-support is not a usage-based feature');
    });

    it('should validate customer has active subscription with feature', async () => {
      // Given: Customer without subscription
      const customerId = 'customer-no-sub';

      // When: Attempting to track usage
      const trackPromise = featuresService.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 1
      });

      // Then: Should throw error
      await expect(trackPromise).rejects.toThrow('No active subscription found for customer');
    });
  });

  describe('checkAccess()', () => {
    it('should return has_access=true when under limit', async () => {
      // Given: Usage at 500/1000
      const customerId = 'customer-1';
      await createUsageRecord({
        customer_id: customerId,
        feature_key: 'api-calls',
        consumed_units: 500,
        limit_units: 1000
      });

      // When: Checking access
      const result = await featuresService.checkAccess(customerId, 'api-calls');

      // Then: Should have access with usage details
      expect(result).toEqual({
        has_access: true,
        feature_key: 'api-calls',
        feature_type: 'usage_quota',
        usage: {
          consumed: 500,
          limit: 1000,
          remaining: 500,
          period_start: expect.any(String),
          period_end: expect.any(String)
        }
      });
    });

    it('should return has_access=false when at or over limit', async () => {
      // Given: Usage at 1000/1000
      await createUsageRecord({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        consumed_units: 1000,
        limit_units: 1000
      });

      // When: Checking access
      const result = await featuresService.checkAccess('customer-1', 'api-calls');

      // Then: Should not have access
      expect(result.has_access).toBe(false);
      expect(result.usage.remaining).toBe(0);
    });

    it('should handle unlimited features (null limit)', async () => {
      // Given: Unlimited feature
      await createUsageRecord({
        customer_id: 'customer-1',
        feature_key: 'storage-gb',
        consumed_units: 999999,
        limit_units: null
      });

      // When: Checking access
      const result = await featuresService.checkAccess('customer-1', 'storage-gb');

      // Then: Should always have access
      expect(result.has_access).toBe(true);
      expect(result.usage.limit).toBeNull();
      expect(result.usage.remaining).toBeNull();
    });
  });

  describe('getUsageMetrics()', () => {
    it('should calculate percentage_used correctly', async () => {
      // Given: 750/1000 usage
      await createUsageRecord({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        consumed_units: 750,
        limit_units: 1000
      });

      // When: Getting metrics
      const result = await featuresService.getUsageMetrics('customer-1', 'api-calls');

      // Then: Should show 75% used
      expect(result[0].percentage_used).toBe(75);
    });

    it('should calculate resets_in_days based on period_end', async () => {
      // Given: Period ending in 15 days
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 15);

      await createUsageRecord({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        period_end: periodEnd.toISOString()
      });

      // When: Getting metrics
      const result = await featuresService.getUsageMetrics('customer-1', 'api-calls');

      // Then: Should show ~15 days until reset
      expect(result[0].resets_in_days).toBeCloseTo(15, 0);
    });

    it('should return metrics for all features when featureName not specified', async () => {
      // Given: Multiple features with usage
      await createUsageRecord({ feature_key: 'api-calls', consumed_units: 100 });
      await createUsageRecord({ feature_key: 'ai-tokens', consumed_units: 500 });
      await createUsageRecord({ feature_key: 'storage-gb', consumed_units: 10 });

      // When: Getting all metrics
      const result = await featuresService.getUsageMetrics('customer-1');

      // Then: Should return array with all features
      expect(result).toHaveLength(3);
      expect(result.map(m => m.feature_key)).toEqual(['api-calls', 'ai-tokens', 'storage-gb']);
    });
  });
});
```

### 3. API Controller Tests

```javascript
describe('V1FeaturesController', () => {
  describe('POST /v1/features/track-usage', () => {
    it('should map external_user_id to internal customer_id', async () => {
      // Given: Session token with external_user_id
      const sessionToken = 'valid-session-token';
      const externalUserId = 'user-123';
      mockSessionToken(sessionToken, { external_user_id: externalUserId });

      // When: Tracking usage via API
      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          feature_key: 'api-calls',
          quantity: 10
        });

      // Then: Should map to internal customer and track
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        feature_key: 'api-calls',
        quantity: 10,
        recorded_at: expect.any(String)
      });
    });

    it('should validate session token', async () => {
      // Given: Invalid session token
      const invalidToken = 'invalid-token';

      // When: Attempting to track usage
      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({
          feature_key: 'api-calls',
          quantity: 10
        });

      // Then: Should return 401
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid session token');
    });

    it('should validate required fields', async () => {
      // Given: Valid session but missing feature_key
      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', 'Bearer valid-token')
        .send({
          quantity: 10
          // missing feature_key
        });

      // Then: Should return 400
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('feature_key is required');
    });
  });

  describe('GET /v1/features/check', () => {
    it('should check feature access for customer', async () => {
      // Given: Customer with usage under limit
      const sessionToken = 'valid-token';
      mockSessionToken(sessionToken, { customer_id: 'customer-1' });

      // When: Checking feature access
      const response = await request(app)
        .get('/v1/features/check?feature_key=api-calls')
        .set('Authorization', `Bearer ${sessionToken}`);

      // Then: Should return entitlement with usage
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        feature_key: 'api-calls',
        has_access: true,
        limit: 1000,
        usage: 500,
        metadata: {}
      });
    });

    it('should return 404 for non-existent feature', async () => {
      // Given: Feature that doesn't exist
      const response = await request(app)
        .get('/v1/features/check?feature_key=non-existent')
        .set('Authorization', 'Bearer valid-token');

      // Then: Should return 404
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Feature not found');
    });
  });

  describe('GET /v1/features/usage-metrics', () => {
    it('should return usage metrics for customer', async () => {
      // Given: Customer with usage data
      const response = await request(app)
        .get('/v1/features/usage-metrics')
        .set('Authorization', 'Bearer valid-token');

      // Then: Should return metrics array
      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            feature_key: expect.any(String),
            current_usage: expect.any(Number),
            limit: expect.any(Number),
            period_start: expect.any(String),
            period_end: expect.any(String)
          })
        ])
      );
    });

    it('should filter by feature_key when provided', async () => {
      // Given: Specific feature requested
      const response = await request(app)
        .get('/v1/features/usage-metrics?feature_key=api-calls')
        .set('Authorization', 'Bearer valid-token');

      // Then: Should return only that feature
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].feature_key).toBe('api-calls');
    });
  });
});
```

### 4. SDK Client Tests

```javascript
describe('BillingOS SDK Client', () => {
  describe('trackUsage()', () => {
    it('should send usage event to API', async () => {
      // Given: SDK client with valid session
      const client = new BillingOSClient({
        apiKey: 'test-api-key',
        apiUrl: 'http://localhost:3001'
      });
      await client.init();

      // When: Tracking usage
      const result = await client.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        quantity: 5,
        metadata: {
          endpoint: '/api/generate',
          model: 'gpt-4'
        }
      });

      // Then: Should return success
      expect(result).toEqual({
        success: true,
        feature_key: 'api-calls',
        quantity: 5,
        recorded_at: expect.any(String)
      });
    });

    it('should handle network errors gracefully', async () => {
      // Given: Network failure
      mockNetworkError();

      // When: Attempting to track usage
      const promise = client.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        quantity: 5
      });

      // Then: Should throw with helpful message
      await expect(promise).rejects.toThrow('Failed to track usage: Network error');
    });

    it('should retry on temporary failures', async () => {
      // Given: First call fails, second succeeds
      let callCount = 0;
      mockAPI(() => {
        callCount++;
        if (callCount === 1) throw new Error('Temporary failure');
        return { success: true };
      });

      // When: Tracking usage
      const result = await client.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        quantity: 5
      });

      // Then: Should succeed after retry
      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });
  });

  describe('checkEntitlement()', () => {
    it('should check feature access', async () => {
      // Given: Customer with entitlement
      const result = await client.checkEntitlement({
        customer_id: 'customer-1',
        feature_key: 'api-calls'
      });

      // Then: Should return entitlement details
      expect(result).toEqual({
        feature_key: 'api-calls',
        has_access: true,
        limit: 1000,
        usage: 500,
        metadata: {}
      });
    });

    it('should cache entitlement checks', async () => {
      // Given: Multiple checks for same feature
      const spy = jest.spyOn(client, 'makeRequest');

      // When: Checking same entitlement twice
      await client.checkEntitlement({ customer_id: 'customer-1', feature_key: 'api-calls' });
      await client.checkEntitlement({ customer_id: 'customer-1', feature_key: 'api-calls' });

      // Then: Should only make one API call (cached)
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
```

### 5. React Hook Tests

```javascript
describe('React Hooks', () => {
  describe('useTrackUsage', () => {
    it('should track usage and invalidate queries', async () => {
      // Given: Component using the hook
      const { result } = renderHook(() => useTrackUsage(), {
        wrapper: QueryClientProvider
      });

      // When: Tracking usage
      await act(async () => {
        await result.current.mutateAsync({
          customer_id: 'customer-1',
          feature_key: 'api-calls',
          quantity: 10
        });
      });

      // Then: Should invalidate related queries
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['usage-metrics', 'customer-1']
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['entitlement', 'customer-1', 'api-calls']
      });
    });

    it('should handle errors with onError callback', async () => {
      // Given: Error handler
      const onError = jest.fn();
      const { result } = renderHook(() => useTrackUsage({ onError }));

      // When: Tracking fails
      mockAPIError('Quota exceeded');
      await act(async () => {
        await result.current.mutate({
          customer_id: 'customer-1',
          feature_key: 'api-calls',
          quantity: 1000
        });
      });

      // Then: Should call error handler
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Quota exceeded'
        })
      );
    });
  });

  describe('useIsApproachingLimit', () => {
    it('should return true when usage above threshold', () => {
      // Given: Usage at 85% of limit
      mockUsageMetrics({
        current_usage: 850,
        limit: 1000
      });

      // When: Checking if approaching limit (80% threshold)
      const { result } = renderHook(() =>
        useIsApproachingLimit('customer-1', 'api-calls', 0.8)
      );

      // Then: Should return true
      expect(result.current).toBe(true);
    });

    it('should return false for unlimited features', () => {
      // Given: Unlimited feature
      mockUsageMetrics({
        current_usage: 999999,
        limit: null
      });

      // When: Checking if approaching limit
      const { result } = renderHook(() =>
        useIsApproachingLimit('customer-1', 'storage-gb')
      );

      // Then: Should always return false
      expect(result.current).toBe(false);
    });
  });

  describe('useHasFeature', () => {
    it('should return boolean for feature access', () => {
      // Given: Customer with access
      mockEntitlement({ has_access: true });

      // When: Checking feature
      const { result } = renderHook(() =>
        useHasFeature('customer-1', 'premium-support')
      );

      // Then: Should return true
      expect(result.current).toBe(true);
    });

    it('should return false when loading', () => {
      // Given: Query still loading
      const { result } = renderHook(() =>
        useHasFeature('customer-1', 'api-calls')
      );

      // Then: Should return false while loading
      expect(result.current).toBe(false);
    });
  });
});
```

### 6. Customer Email Notification Tests (TO IMPLEMENT)

```javascript
describe('Customer Email Notifications', () => {
  describe('Usage Warning Emails', () => {
    it('should send email when usage reaches 80% threshold', async () => {
      // Given: Customer at 79% usage
      const customerId = 'customer-1';
      await createUsageRecord({
        customer_id: customerId,
        feature_key: 'api-calls',
        consumed_units: 790,
        limit_units: 1000
      });

      // When: Next usage puts them over 80%
      await featuresService.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 20  // Now 810/1000 (81%)
      });

      // Then: Warning email should be sent
      expect(emailService.send).toHaveBeenCalledWith({
        to: customer.email,
        subject: 'Usage Warning: Approaching API Calls Limit',
        template: 'usage-warning',
        data: {
          customer_name: customer.name,
          feature_name: 'API Calls',
          percentage_used: 81,
          consumed: 810,
          limit: 1000,
          remaining: 190,
          days_until_reset: expect.any(Number)
        }
      });
    });

    it('should send email when usage reaches 90% threshold', async () => {
      // Given: Customer at 89% usage
      await createUsageRecord({
        consumed_units: 890,
        limit_units: 1000
      });

      // When: Crossing 90% threshold
      await featuresService.trackUsage({ quantity: 15 });

      // Then: Critical warning email sent
      expect(emailService.send).toHaveBeenCalledWith({
        template: 'usage-critical',
        data: expect.objectContaining({
          percentage_used: 90.5
        })
      });
    });

    it('should not send duplicate emails for same threshold', async () => {
      // Given: Already at 85% and email was sent
      await createUsageRecord({
        consumed_units: 850,
        limit_units: 1000
      });
      emailService.send.mockClear();

      // When: Still tracking within same threshold
      await featuresService.trackUsage({ quantity: 10 }); // 86%

      // Then: No new email (still in 80-90% range)
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('should track email history to prevent spam', async () => {
      // Given: Email history table tracks sent notifications
      const customerId = 'customer-1';

      // When: Checking if should send 80% warning
      const shouldSend = await emailService.shouldSendThresholdEmail(
        customerId,
        'api-calls',
        80,
        'current-period-id'
      );

      // Then: Check email history
      expect(shouldSend).toBe(true);

      // After sending, mark as sent
      await emailService.markThresholdEmailSent(
        customerId,
        'api-calls',
        80,
        'current-period-id'
      );

      // Should not send again for same period
      const shouldSendAgain = await emailService.shouldSendThresholdEmail(
        customerId,
        'api-calls',
        80,
        'current-period-id'
      );
      expect(shouldSendAgain).toBe(false);
    });
  });

  describe('Quota Exceeded Emails', () => {
    it('should send email when quota is exceeded', async () => {
      // Given: At limit
      await createUsageRecord({
        consumed_units: 1000,
        limit_units: 1000
      });

      // When: Trying to exceed
      try {
        await featuresService.trackUsage({ quantity: 1 });
      } catch (e) {
        // Expected to throw
      }

      // Then: Quota exceeded email sent
      expect(emailService.send).toHaveBeenCalledWith({
        template: 'quota-exceeded',
        data: {
          feature_name: 'API Calls',
          limit: 1000,
          upgrade_url: expect.stringContaining('/upgrade'),
          support_email: 'support@billingos.com'
        }
      });
    });

    it('should include next steps in quota exceeded email', async () => {
      // Email should guide customer on what to do
      const emailData = {
        template: 'quota-exceeded',
        data: {
          next_steps: [
            'Upgrade your plan for higher limits',
            'Contact support for temporary increase',
            'Wait for usage reset on [date]'
          ]
        }
      };

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining(emailData)
      );
    });
  });

  describe('Usage Summary Emails', () => {
    it('should send weekly usage summary if configured', async () => {
      // Given: Customer opted into weekly summaries
      const customer = await getCustomer('customer-1');
      customer.email_preferences.weekly_usage_summary = true;

      // When: Weekly cron job runs
      await emailService.sendWeeklyUsageSummaries();

      // Then: Summary email sent
      expect(emailService.send).toHaveBeenCalledWith({
        template: 'weekly-usage-summary',
        data: {
          features: [
            {
              name: 'API Calls',
              consumed: 750,
              limit: 1000,
              percentage: 75,
              trend: 'up' // vs last week
            },
            {
              name: 'AI Tokens',
              consumed: 5000,
              limit: 10000,
              percentage: 50,
              trend: 'stable'
            }
          ],
          period_end: expect.any(Date),
          days_remaining: expect.any(Number)
        }
      });
    });
  });
});
```

### 7. Merchant Analytics Dashboard Tests (TO IMPLEMENT)

```javascript
describe('Merchant Analytics Dashboard', () => {
  describe('Aggregate Usage Metrics', () => {
    it('should show total usage across all customers', async () => {
      // Given: Multiple customers with usage
      await createMultipleCustomersWithUsage();

      // When: Fetching dashboard metrics
      const metrics = await analyticsService.getOrganizationMetrics(orgId);

      // Then: Should aggregate correctly
      expect(metrics).toEqual({
        total_api_calls: 15000,
        total_ai_tokens: 250000,
        total_storage_gb: 500,
        active_customers: 25,
        customers_approaching_limits: 5,
        customers_at_limit: 2
      });
    });

    it('should identify customers approaching limits', async () => {
      // Given: Customers at various usage levels
      await createCustomerAt75Percent();
      await createCustomerAt85Percent();
      await createCustomerAt95Percent();

      // When: Getting at-risk customers
      const atRisk = await analyticsService.getCustomersApproachingLimits(orgId);

      // Then: Should return sorted by risk
      expect(atRisk).toEqual([
        { customer_id: 'customer-95', percentage: 95, feature: 'api-calls' },
        { customer_id: 'customer-85', percentage: 85, feature: 'ai-tokens' },
        { customer_id: 'customer-75', percentage: 75, feature: 'storage-gb' }
      ]);
    });

    it('should show feature adoption rates', async () => {
      // Given: 100 customers, 60 using API, 40 using AI
      const adoption = await analyticsService.getFeatureAdoption(orgId);

      // Then: Show adoption percentages
      expect(adoption).toEqual({
        'api-calls': {
          total_customers: 100,
          active_users: 60,
          adoption_rate: 60,
          avg_usage: 500,
          total_consumed: 30000
        },
        'ai-tokens': {
          total_customers: 100,
          active_users: 40,
          adoption_rate: 40,
          avg_usage: 2500,
          total_consumed: 100000
        }
      });
    });
  });

  describe('Usage Trends', () => {
    it('should show usage trends over time', async () => {
      // Given: Historical usage data
      const trends = await analyticsService.getUsageTrends(
        orgId,
        'api-calls',
        '30d'
      );

      // Then: Return time series data
      expect(trends).toEqual({
        feature: 'api-calls',
        period: '30d',
        data_points: expect.arrayContaining([
          { date: '2024-01-01', usage: 1000 },
          { date: '2024-01-02', usage: 1200 },
          // ... 30 days of data
        ]),
        trend_direction: 'increasing',
        growth_rate: 15.5
      });
    });

    it('should show customer-specific usage patterns', async () => {
      // Given: Customer ID
      const patterns = await analyticsService.getCustomerUsagePattern(
        'customer-1'
      );

      // Then: Show their usage pattern
      expect(patterns).toEqual({
        peak_usage_hour: 14, // 2 PM
        peak_usage_day: 'Tuesday',
        avg_daily_usage: 125,
        burst_pattern: true,
        steady_usage: false
      });
    });
  });

  describe('Dashboard UI Components', () => {
    it('should render usage overview cards', async () => {
      // Given: Dashboard page
      const { getByTestId } = render(<MetersPage />);

      // Then: Key metrics displayed
      expect(getByTestId('total-usage-card')).toHaveTextContent('15,000');
      expect(getByTestId('active-customers-card')).toHaveTextContent('25');
      expect(getByTestId('at-risk-card')).toHaveTextContent('5');
    });

    it('should render usage charts', async () => {
      // Given: Dashboard with chart
      const { getByTestId } = render(<UsageChart />);

      // Then: Chart renders with data
      expect(getByTestId('usage-chart')).toBeInTheDocument();
      expect(getByTestId('chart-legend')).toContainText('API Calls');
    });

    it('should allow filtering by date range', async () => {
      // Given: Date range selector
      const { getByRole } = render(<MetersPage />);
      const dateSelector = getByRole('combobox', { name: /date range/i });

      // When: Selecting last 7 days
      fireEvent.change(dateSelector, { target: { value: '7d' } });

      // Then: Data updates
      await waitFor(() => {
        expect(getByTestId('total-usage-card')).toHaveTextContent('3,500');
      });
    });

    it('should export usage data as CSV', async () => {
      // Given: Export button
      const { getByRole } = render(<MetersPage />);
      const exportBtn = getByRole('button', { name: /export/i });

      // When: Clicking export
      fireEvent.click(exportBtn);

      // Then: CSV downloaded
      expect(downloadCSV).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/usage-report-.*\.csv/),
          data: expect.arrayContaining([
            ['Customer', 'Feature', 'Usage', 'Limit', 'Percentage']
          ])
        })
      );
    });
  });
});
```

### 8. End-to-End Flow Tests

```javascript
describe('End-to-End Flows', () => {
  describe('AI Token Consumption Flow', () => {
    it('should track AI token usage throughout customer journey', async () => {
      // Given: New customer with 10,000 token limit
      const customerId = await createCustomer('startup-plan');
      const tokenLimit = 10000;

      // When: Customer makes multiple AI calls
      // First call - 500 tokens
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'ai-tokens',
        quantity: 500,
        metadata: { model: 'gpt-4', type: 'completion' }
      });

      // Check remaining
      let metrics = await sdk.getUsageMetrics(customerId, 'ai-tokens');
      expect(metrics.remaining).toBe(9500);

      // Second call - 2000 tokens
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'ai-tokens',
        quantity: 2000,
        metadata: { model: 'gpt-4', type: 'embeddings' }
      });

      metrics = await sdk.getUsageMetrics(customerId, 'ai-tokens');
      expect(metrics.remaining).toBe(7500);

      // Approaching limit - 7000 tokens (total: 9500)
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'ai-tokens',
        quantity: 7000,
        metadata: { model: 'gpt-4-turbo', type: 'batch' }
      });

      // Check if approaching limit (95% used)
      const isApproaching = await sdk.isApproachingLimit(customerId, 'ai-tokens', 0.8);
      expect(isApproaching).toBe(true);
      expect(metrics.percentage_used).toBe(95);

      // Attempt to exceed limit - should fail
      const exceedPromise = sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'ai-tokens',
        quantity: 1000
      });

      // Then: Should block over-limit usage
      await expect(exceedPromise).rejects.toThrow('Quota exceeded');

      // Verify final state
      metrics = await sdk.getUsageMetrics(customerId, 'ai-tokens');
      expect(metrics.consumed).toBe(9500);
      expect(metrics.remaining).toBe(500);
    });
  });

  describe('API Rate Limiting Flow', () => {
    it('should enforce API call limits per billing period', async () => {
      // Given: Customer on basic plan with 1000 API calls/month
      const customerId = 'customer-basic';
      const apiLimit = 1000;

      // When: Making API calls throughout the month
      for (let i = 0; i < 999; i++) {
        await sdk.trackUsage({
          customer_id: customerId,
          feature_key: 'api-calls',
          quantity: 1
        });
      }

      // Check near limit
      const entitlement = await sdk.checkEntitlement(customerId, 'api-calls');
      expect(entitlement.has_access).toBe(true);
      expect(entitlement.usage).toBe(999);
      expect(entitlement.limit).toBe(1000);

      // Make 1000th call - should succeed
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 1
      });

      // Check at limit
      const atLimit = await sdk.checkEntitlement(customerId, 'api-calls');
      expect(atLimit.has_access).toBe(false);
      expect(atLimit.usage).toBe(1000);

      // Attempt 1001st call - should fail
      await expect(
        sdk.trackUsage({
          customer_id: customerId,
          feature_key: 'api-calls',
          quantity: 1
        })
      ).rejects.toThrow('Quota exceeded');

      // Then: Customer needs to upgrade or wait for period reset
      const metrics = await sdk.getUsageMetrics(customerId, 'api-calls');
      expect(metrics.resets_in_days).toBeGreaterThan(0);
      expect(metrics.resets_in_days).toBeLessThanOrEqual(31);
    });
  });

  describe('Multi-Feature Usage Tracking', () => {
    it('should track multiple feature types independently', async () => {
      // Given: Customer with multiple metered features
      const customerId = 'customer-pro';

      // When: Using different features
      await Promise.all([
        sdk.trackUsage({
          customer_id: customerId,
          feature_key: 'api-calls',
          quantity: 100
        }),
        sdk.trackUsage({
          customer_id: customerId,
          feature_key: 'ai-tokens',
          quantity: 5000
        }),
        sdk.trackUsage({
          customer_id: customerId,
          feature_key: 'storage-gb',
          quantity: 2.5
        })
      ]);

      // Then: Each feature tracked independently
      const metrics = await sdk.getUsageMetrics(customerId);

      const apiMetrics = metrics.find(m => m.feature_key === 'api-calls');
      expect(apiMetrics.current_usage).toBe(100);

      const tokenMetrics = metrics.find(m => m.feature_key === 'ai-tokens');
      expect(tokenMetrics.current_usage).toBe(5000);

      const storageMetrics = metrics.find(m => m.feature_key === 'storage-gb');
      expect(storageMetrics.current_usage).toBe(2.5);
    });
  });

  describe('Upgrade Trigger Flow', () => {
    it('should identify when customer needs upgrade', async () => {
      // Given: Customer approaching multiple limits
      const customerId = 'customer-growth';

      // When: Heavy usage across features
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 950  // 95% of 1000 limit
      });

      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'ai-tokens',
        quantity: 8500  // 85% of 10000 limit
      });

      // Then: Should identify upgrade opportunity
      const entitlements = await sdk.listEntitlements(customerId);

      const needsUpgrade = entitlements.some(e => {
        if (e.usage && e.limit) {
          const percentageUsed = (e.usage / e.limit) * 100;
          return percentageUsed >= 80;
        }
        return false;
      });

      expect(needsUpgrade).toBe(true);

      // Check specific features approaching limit
      const apiApproaching = await sdk.isApproachingLimit(customerId, 'api-calls', 0.9);
      const tokenApproaching = await sdk.isApproachingLimit(customerId, 'ai-tokens', 0.8);

      expect(apiApproaching).toBe(true);
      expect(tokenApproaching).toBe(true);
    });
  });
});
```

### 9. Error & Edge Case Tests

```javascript
describe('Error Handling & Edge Cases', () => {
  describe('Concurrent Usage Tracking', () => {
    it('should handle 100 concurrent tracking requests without race conditions', async () => {
      // Given: Customer with 10000 unit limit
      const customerId = 'customer-concurrent';
      const requests = 100;
      const unitsPerRequest = 10;

      // When: 100 concurrent requests
      const promises = Array.from({ length: requests }, () =>
        sdk.trackUsage({
          customer_id: customerId,
          feature_key: 'api-calls',
          quantity: unitsPerRequest
        })
      );

      await Promise.all(promises);

      // Then: Should have exactly 1000 units
      const metrics = await sdk.getUsageMetrics(customerId, 'api-calls');
      expect(metrics.current_usage).toBe(requests * unitsPerRequest);
    });
  });

  describe('Period Boundary Handling', () => {
    it('should handle usage tracking at period boundaries', async () => {
      // Given: Current period ending in 1 hour
      const customerId = 'customer-boundary';
      const periodEnd = new Date();
      periodEnd.setHours(periodEnd.getHours() + 1);

      // When: Tracking usage near boundary
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 50
      });

      // Wait until after period boundary
      await waitFor(periodEnd.getTime() + 60000);

      // Track in new period
      await sdk.trackUsage({
        customer_id: customerId,
        feature_key: 'api-calls',
        quantity: 10
      });

      // Then: New period should have fresh usage
      const metrics = await sdk.getUsageMetrics(customerId, 'api-calls');
      expect(metrics.current_usage).toBe(10); // Not 60
    });
  });

  describe('Invalid Input Handling', () => {
    it('should reject negative quantity', async () => {
      await expect(
        sdk.trackUsage({
          customer_id: 'customer-1',
          feature_key: 'api-calls',
          quantity: -10
        })
      ).rejects.toThrow('Quantity must be positive');
    });

    it('should reject zero quantity', async () => {
      await expect(
        sdk.trackUsage({
          customer_id: 'customer-1',
          feature_key: 'api-calls',
          quantity: 0
        })
      ).rejects.toThrow('Quantity must be greater than 0');
    });

    it('should handle non-existent customer gracefully', async () => {
      await expect(
        sdk.trackUsage({
          customer_id: 'non-existent',
          feature_key: 'api-calls',
          quantity: 10
        })
      ).rejects.toThrow('Customer not found');
    });

    it('should handle non-existent feature gracefully', async () => {
      await expect(
        sdk.trackUsage({
          customer_id: 'customer-1',
          feature_key: 'non-existent-feature',
          quantity: 10
        })
      ).rejects.toThrow('Feature not found');
    });
  });

  describe('Database Connection Failures', () => {
    it('should handle database connection loss', async () => {
      // Given: Database connection lost
      mockDatabaseDown();

      // When: Attempting to track usage
      const promise = sdk.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        quantity: 10
      });

      // Then: Should fail with appropriate error
      await expect(promise).rejects.toThrow('Service temporarily unavailable');
    });

    it('should recover when database connection restored', async () => {
      // Given: Database was down, now restored
      mockDatabaseDown();
      await expect(sdk.trackUsage({ /* ... */ })).rejects.toThrow();

      mockDatabaseUp();

      // When: Tracking usage again
      const result = await sdk.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'api-calls',
        quantity: 10
      });

      // Then: Should succeed
      expect(result.success).toBe(true);
    });
  });

  describe('Fractional Unit Edge Cases', () => {
    it('should handle very small fractional units', async () => {
      // Given: Tracking 0.000001 units
      const result = await sdk.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'compute-hours',
        quantity: 0.000001
      });

      // Then: Should track precisely
      expect(result.quantity).toBe(0.000001);
      const metrics = await sdk.getUsageMetrics('customer-1', 'compute-hours');
      expect(metrics.current_usage).toBe(0.000001);
    });

    it('should handle precision limits correctly', async () => {
      // Given: Attempting to track beyond 6 decimal places
      const result = await sdk.trackUsage({
        customer_id: 'customer-1',
        feature_key: 'compute-hours',
        quantity: 1.1234567 // 7 decimal places
      });

      // Then: Should round to 6 decimal places
      expect(result.quantity).toBe(1.123457);
    });
  });
});
```

### 10. Performance Tests

```javascript
describe('Performance Tests', () => {
  describe('Query Performance', () => {
    it('should fetch usage metrics in under 100ms', async () => {
      // Given: Customer with usage data
      const customerId = 'customer-perf';

      // When: Fetching metrics
      const startTime = Date.now();
      await sdk.getUsageMetrics(customerId);
      const endTime = Date.now();

      // Then: Should complete quickly
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle bulk entitlement checks efficiently', async () => {
      // Given: 50 features to check
      const features = Array.from({ length: 50 }, (_, i) => `feature-${i}`);

      // When: Checking all entitlements
      const startTime = Date.now();
      await Promise.all(
        features.map(f => sdk.checkEntitlement('customer-1', f))
      );
      const endTime = Date.now();

      // Then: Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe('Load Testing', () => {
    it('should handle 1000 requests per second', async () => {
      // Given: Load test configuration
      const requestsPerSecond = 1000;
      const durationSeconds = 5;

      // When: Simulating load
      const results = await loadTest({
        endpoint: '/v1/features/track-usage',
        requestsPerSecond,
        duration: durationSeconds,
        payload: {
          feature_key: 'api-calls',
          quantity: 1
        }
      });

      // Then: Should maintain performance
      expect(results.successRate).toBeGreaterThan(0.99);
      expect(results.p95ResponseTime).toBeLessThan(200);
      expect(results.p99ResponseTime).toBeLessThan(500);
    });
  });

  describe('Cache Performance (Future)', () => {
    it.skip('should serve cached entitlements in under 10ms', async () => {
      // Given: Warmed cache
      await sdk.checkEntitlement('customer-1', 'api-calls');

      // When: Fetching from cache
      const startTime = Date.now();
      await sdk.checkEntitlement('customer-1', 'api-calls');
      const endTime = Date.now();

      // Then: Should be very fast
      expect(endTime - startTime).toBeLessThan(10);
    });
  });
});
```

### 11. Security Tests

```javascript
describe('Security Tests', () => {
  describe('Authentication & Authorization', () => {
    it('should reject requests without session token', async () => {
      const response = await request(app)
        .post('/v1/features/track-usage')
        .send({
          feature_key: 'api-calls',
          quantity: 10
        });

      expect(response.status).toBe(401);
    });

    it('should reject expired session tokens', async () => {
      // Given: Expired token
      const expiredToken = generateExpiredToken();

      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          feature_key: 'api-calls',
          quantity: 10
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Session expired');
    });

    it('should prevent cross-customer usage tracking', async () => {
      // Given: Token for customer-1
      const token = generateTokenFor('customer-1');

      // When: Attempting to track for customer-2
      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customer_id: 'customer-2', // Different customer
          feature_key: 'api-calls',
          quantity: 10
        });

      // Then: Should reject
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Unauthorized customer access');
    });
  });

  describe('Input Validation', () => {
    it('should sanitize feature_key to prevent SQL injection', async () => {
      // Given: Malicious feature key
      const maliciousKey = "api-calls'; DROP TABLE usage_records; --";

      // When: Attempting injection
      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', 'Bearer valid-token')
        .send({
          feature_key: maliciousKey,
          quantity: 10
        });

      // Then: Should reject invalid input
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid feature_key');
    });

    it('should validate quantity is within reasonable bounds', async () => {
      // Given: Extremely large quantity
      const response = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', 'Bearer valid-token')
        .send({
          feature_key: 'api-calls',
          quantity: Number.MAX_SAFE_INTEGER
        });

      // Then: Should reject unreasonable value
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Quantity exceeds maximum allowed');
    });
  });

  describe('Rate Limiting (Future)', () => {
    it.skip('should enforce rate limits per customer', async () => {
      // Given: Rate limit of 100 requests per minute
      const requests = 150;
      const promises = [];

      // When: Exceeding rate limit
      for (let i = 0; i < requests; i++) {
        promises.push(
          request(app)
            .post('/v1/features/track-usage')
            .set('Authorization', 'Bearer valid-token')
            .send({ feature_key: 'api-calls', quantity: 1 })
        );
      }

      const results = await Promise.all(promises);

      // Then: Some requests should be rate limited
      const rateLimited = results.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body.message).toContain('Rate limit exceeded');
    });
  });

  describe('Idempotency (Future)', () => {
    it.skip('should prevent duplicate usage tracking with idempotency key', async () => {
      // Given: Idempotency key
      const idempotencyKey = 'unique-request-123';

      // When: Sending same request twice
      const response1 = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({ feature_key: 'api-calls', quantity: 10 });

      const response2 = await request(app)
        .post('/v1/features/track-usage')
        .set('Authorization', 'Bearer valid-token')
        .set('Idempotency-Key', idempotencyKey)
        .send({ feature_key: 'api-calls', quantity: 10 });

      // Then: Second request should return cached response
      expect(response1.body).toEqual(response2.body);

      // Verify only tracked once
      const metrics = await sdk.getUsageMetrics('customer-1', 'api-calls');
      expect(metrics.current_usage).toBe(10); // Not 20
    });
  });
});
```

---

## Phase 2: Future Test Cases (Metered Billing)

These tests will be needed when implementing actual usage-based billing:

### 1. Usage-Based Pricing Calculations

```javascript
describe('Usage Pricing Calculations (Phase 2)', () => {
  it('should calculate usage charges based on consumed units', async () => {
    // Given: Customer consumed 1500 API calls at $0.001 per call
    const usage = { consumed: 1500, rate: 0.001 };

    // When: Calculating charges
    const charges = await billingService.calculateUsageCharges(customerId);

    // Then: Correct amount
    expect(charges.api_calls).toBe(1.50);
  });

  it('should handle tiered pricing', async () => {
    // Given: Tiered pricing (0-1000: $0.001, 1001-5000: $0.0008)
    // When: Customer uses 2000 calls
    // Then: Calculate correctly (1000 * 0.001 + 1000 * 0.0008 = $1.80)
  });

  it('should calculate overage charges', async () => {
    // Given: Plan includes 1000 calls, overage at $0.002 per call
    // When: Customer uses 1500 calls
    // Then: 500 overage calls * $0.002 = $1.00 overage
  });
});
```

### 2. Stripe Metering Integration

```javascript
describe('Stripe Metering Integration (Phase 2)', () => {
  it('should send usage events to Stripe', async () => {
    // Given: Usage event
    const event = { customerId, quantity: 100, timestamp };

    // When: Syncing to Stripe
    await stripeService.reportUsage(event);

    // Then: Stripe API called
    expect(stripe.subscriptionItems.createUsageRecord).toHaveBeenCalledWith(
      subscriptionItemId,
      { quantity: 100, timestamp }
    );
  });

  it('should handle Stripe metering webhooks', async () => {
    // Given: Stripe webhook for usage summary
    // When: Processing webhook
    // Then: Update local usage records
  });
});
```

### 3. Invoice Generation with Usage

```javascript
describe('Invoice Generation (Phase 2)', () => {
  it('should include usage line items on invoices', async () => {
    // Given: End of billing period
    const invoice = await billingService.generateInvoice(customerId);

    // Then: Include usage items
    expect(invoice.line_items).toContainEqual({
      description: 'API Calls - 1500 calls',
      amount: 1.50
    });
  });
});
```

---

## Test Execution Strategy

### Phase 1 Testing Priorities

#### Priority 1: Core Functionality (Must Have)
1. Usage tracking accuracy (atomic increments)
2. Quota enforcement (hard blocking)
3. SDK authentication and session management
4. Database constraints and RLS policies

#### Priority 2: Customer Experience (Should Have)
1. Email notifications (implement first!)
2. Portal usage display
3. SDK React hooks
4. Period boundary handling

#### Priority 3: Merchant Features (Should Have)
1. Analytics dashboard (implement first!)
2. Aggregate usage metrics
3. Customer risk identification
4. Usage export capabilities

#### Priority 4: Reliability & Performance (Nice to Have)
1. Idempotency protection
2. Rate limiting
3. Concurrent request handling
4. Cache performance (when Redis added)

### Phase 2 Testing Priorities (Future)

1. Usage-based billing calculations
2. Stripe metering integration
3. Invoice generation with usage
4. Overage handling
5. Webhook notifications to merchants

---

## Test Data Setup

```javascript
// Test fixtures
const testCustomers = {
  basic: {
    id: 'customer-basic',
    plan: 'basic',
    limits: { 'api-calls': 1000, 'ai-tokens': 5000 }
  },
  pro: {
    id: 'customer-pro',
    plan: 'pro',
    limits: { 'api-calls': 10000, 'ai-tokens': 50000, 'storage-gb': 100 }
  },
  unlimited: {
    id: 'customer-unlimited',
    plan: 'enterprise',
    limits: { 'api-calls': null, 'ai-tokens': null, 'storage-gb': null }
  }
};

// Helper functions
async function setupTestDatabase() {
  await runMigrations();
  await seedTestData();
}

async function cleanupTestData() {
  await truncate('usage_records');
  await truncate('subscriptions');
  await truncate('customers');
}

async function createTestCustomer(plan) {
  return await db.insert('customers', { ...testCustomers[plan] });
}
```

---

## Success Metrics

### Phase 1 Success Metrics
- **Tracking Accuracy**: 100% accurate usage tracking with no lost events
- **Quota Enforcement**: Hard blocks working reliably, no bypass possible
- **Customer Communication**: Emails sent at correct thresholds (80%, 90%, exceeded)
- **Merchant Visibility**: Dashboard shows real-time usage across all customers
- **Performance**: Usage checks < 50ms, tracking < 100ms p95
- **Reliability**: Zero race conditions in concurrent tracking
- **SDK Integration**: All hooks working correctly with proper cache invalidation

### Phase 2 Success Metrics (Future)
- **Billing Accuracy**: Usage charges calculated correctly to 6 decimal places
- **Stripe Sync**: 100% of usage events reported to Stripe
- **Invoice Correctness**: All usage properly reflected in invoices
- **Test Coverage**: 90%+ code coverage across billing features

---

## Implementation Roadmap

### Phase 1: Immediate Actions (Current Sprint)

#### 🔴 Critical (Do First)
1. **Implement Customer Email Notifications**
   - Add email service integration
   - Create email templates (80%, 90%, exceeded)
   - Track sent emails to prevent duplicates
   - Test with real email delivery

2. **Build Merchant Analytics Dashboard**
   - Create aggregate usage API endpoints
   - Build MetersPage UI components
   - Add usage charts and visualizations
   - Implement CSV export

#### 🟡 Important (Do Next)
3. **Fix Idempotency Protection**
   - Uncomment and implement idempotency logic
   - Add idempotency key storage
   - Test with duplicate requests

4. **Add Rate Limiting**
   - Implement rate limiting middleware
   - Configure per-customer limits
   - Add rate limit headers to responses

#### 🟢 Nice to Have (Do Later)
5. **Performance Optimization**
   - Consider Redis caching
   - Add database indexes if needed
   - Optimize heavy queries

### Phase 2: Future Implementation (Next Quarter)

When ready to implement metered billing:

1. **Design Pricing Models**
   - Define per-unit rates
   - Set up tiered pricing
   - Configure overage policies

2. **Stripe Integration**
   - Implement usage reporting to Stripe
   - Set up metering webhooks
   - Test billing calculations

3. **Invoice Enhancement**
   - Add usage line items
   - Show consumption details
   - Include usage graphs

4. **Merchant Tools**
   - Webhook notifications
   - Alert configuration
   - Usage forecasting

---

## Testing Checklist for Phase 1 Launch

Before launching Phase 1 metering features:

### ✅ Core Functionality
- [ ] Usage tracking working accurately
- [ ] Atomic increments prevent race conditions
- [ ] Quota enforcement blocks access when exceeded
- [ ] Period boundaries handled correctly
- [ ] SDK authentication working

### ✅ Customer Features
- [ ] Portal displays current usage
- [ ] Portal shows days until reset
- [ ] Email sent at 80% usage
- [ ] Email sent at 90% usage
- [ ] Email sent when quota exceeded
- [ ] No duplicate emails sent

### ✅ Merchant Features
- [ ] Dashboard shows aggregate usage
- [ ] Can identify at-risk customers
- [ ] Can export usage data
- [ ] Usage trends visible
- [ ] Feature adoption metrics working

### ✅ Performance & Security
- [ ] All endpoints < 200ms p95
- [ ] Input validation prevents injection
- [ ] Cross-customer access blocked
- [ ] Rate limiting active (when implemented)
- [ ] Idempotency working (when implemented)

### ✅ SDK Integration
- [ ] trackUsage() method working
- [ ] checkEntitlement() returns correct data
- [ ] React hooks updating properly
- [ ] Cache invalidation working
- [ ] Error handling graceful

---

## Production Techniques from Industry Leaders

Based on analysis of production systems at Flowglad and Autumn, here are battle-tested techniques for implementing robust metering:

### 🏆 Idempotency Patterns

#### Flowglad's Approach: Transaction-Based Deduplication
```sql
-- Unique constraint on (transactionId, usageMeterId)
CREATE UNIQUE INDEX usage_events_unique_transaction
ON usage_events(transaction_id, usage_meter_id);

-- Insert with conflict handling
INSERT INTO usage_events (transaction_id, usage_meter_id, quantity, ...)
VALUES ($1, $2, $3, ...)
ON CONFLICT (transaction_id, usage_meter_id) DO NOTHING
RETURNING *;
```

**Benefits:**
- Database-level guarantee against duplicates
- No additional idempotency table needed
- Transaction ID serves dual purpose (tracing + deduplication)

#### Autumn's Approach: Flexible Idempotency Key
```typescript
// Schema includes optional idempotency key
{
  idempotency_key: text('idempotency_key').nullable(),
  // Unique constraint: (org_id, env, customer_id, event_name, idempotency_key)
}

// Client can provide custom idempotency key
await trackUsage({
  customer_id: 'cust_123',
  feature_key: 'api-calls',
  quantity: 10,
  idempotency_key: 'request-uuid-12345'  // Optional but recommended
});
```

**Benefits:**
- Client controls deduplication strategy
- Works across retries and network failures
- Can be generated client-side for true idempotency

### 🚀 Bulk Insert Optimization

#### Flowglad's Batching Strategy
```typescript
// Efficient bulk processing pattern
async function bulkInsertUsageEvents(events: UsageEvent[]) {
  // 1. Group events by customer to minimize lookups
  const eventsByCustomer = groupBy(events, 'customerId');

  // 2. Cache pricing model per customer (critical optimization!)
  for (const [customerId, customerEvents] of Object.entries(eventsByCustomer)) {
    const pricingModel = await fetchAndCachePricingModel(customerId);

    // 3. Resolve all slugs in single pass
    const resolvedEvents = customerEvents.map(event =>
      resolveSlugToId(event, pricingModel)
    );

    // 4. Single batch insert with ON CONFLICT DO NOTHING
    await db.insert(usageEvents)
      .values(resolvedEvents)
      .onConflictDoNothing();
  }
}
```

**Performance Impact:**
- Reduces N+1 query problem
- Single pricing model fetch per customer
- Batch insert minimizes round trips

### 💾 Caching Strategies

#### Autumn's Redis Pattern
```typescript
class UsageCacheManager {
  // Cache with TTL
  async getCachedPricingModel(customerId: string) {
    const key = `pricing:${customerId}`;
    const cached = await redis.get(key);

    if (!cached) {
      const model = await db.fetchPricingModel(customerId);
      await redis.setex(key, 3600, JSON.stringify(model)); // 1 hour TTL
      return model;
    }

    return JSON.parse(cached);
  }

  // Invalidate on changes
  async invalidatePricingCache(customerId: string) {
    await redis.del(`pricing:${customerId}`);
    // Also invalidate related keys
    await redis.del(`limits:${customerId}:*`);
  }
}
```

**Key Insights:**
- 1-hour TTL for pricing data (rarely changes)
- Shorter TTL for usage data (5-15 minutes)
- Pattern-based invalidation for related data

### 📊 Aggregation Types

#### Flowglad's Aggregation Patterns
```typescript
enum UsageMeterAggregationType {
  Sum = 'sum',                                    // Total usage in period
  CountDistinctProperties = 'count_distinct_properties'  // Unique entities
}

// Use cases:
// Sum: API calls, tokens, storage GB
// CountDistinct: Active users, unique IP addresses, distinct API keys

// Implementation for CountDistinct
if (aggregationType === 'count_distinct_properties') {
  // Requires properties field and billing period
  const uniqueCount = await db
    .selectDistinctCount('properties->user_id')
    .from(usageEvents)
    .where({ billing_period_id, usage_meter_id });
}
```

#### Autumn's Set vs Add Pattern
```typescript
// Replace usage vs increment
{
  set_usage: boolean,  // true = replace, false = add
  value: number,       // Amount to set or add
}

// Use cases:
// set_usage=true: Current storage usage, active seats
// set_usage=false: API calls, consumed tokens
```

### 🔄 Queue-Based Processing

#### Autumn's BullMQ Configuration
```typescript
// Critical configuration for production
const queueConnection = new Redis({
  maxRetriesPerRequest: null,  // IMPORTANT: Prevents queue stalling
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 5000, 30000), // Backoff
});

const usageQueue = new Queue('usage-tracking', {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },  // Keep last 100 for debugging
    removeOnFail: { count: 1000 },      // Keep failed for analysis
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
});

// Worker processing
const worker = new Worker('usage-tracking', async (job) => {
  const { events } = job.data;

  // Batch process with retry logic
  try {
    await bulkInsertUsageEvents(events);
  } catch (error) {
    // Check if retryable
    if (isRetryableError(error)) {
      throw error; // BullMQ will retry
    }
    // Non-retryable, mark as failed
    await job.log(`Non-retryable error: ${error.message}`);
    return { error: error.message };
  }
}, {
  connection: queueConnection,
  concurrency: 5,  // Process 5 jobs in parallel
});
```

### 🧪 Testing Patterns

#### Comprehensive Test Coverage (from Autumn)
```typescript
// Test file organization
tests/
├── usage/
│   ├── usage1.test.ts          // Basic tracking
│   ├── usageLimit1-4.test.ts   // Limit enforcement
│   ├── rollover1-6.test.ts     // Period rollovers
│   └── multiFeature1-3.test.ts // Feature combinations
```

#### Critical Test Scenarios
1. **Concurrent Usage**: 100+ simultaneous requests
2. **Idempotency**: Duplicate requests return same result
3. **Limit Enforcement**: Hard stop at quota
4. **Period Boundaries**: Correct reset behavior
5. **Bulk Operations**: Partial failures handled correctly

### 🎯 Implementation Recommendations for BillingOS

#### Phase 1 Quick Wins (Implement Now)
1. **Database Unique Constraint** (Flowglad pattern)
   - Add unique index on (transaction_id, feature_id)
   - Use ON CONFLICT DO NOTHING

2. **Bulk Insert Optimization** (Flowglad pattern)
   - Group by customer
   - Cache pricing/limits per request batch

3. **Simple Idempotency** (Hybrid approach)
   - Required transaction_id for deduplication
   - Optional idempotency_key for client control

#### Phase 1.5 Performance Boost
1. **Redis Caching** (Autumn pattern)
   - Cache customer limits (5-minute TTL)
   - Cache pricing models (1-hour TTL)
   - Invalidate on subscription changes

2. **Async Processing** (Autumn pattern)
   - Queue non-critical usage events
   - Batch process every 10 seconds
   - Sync process for limit-approaching customers

#### Key Insights Not to Miss
1. **Flowglad's CountDistinctProperties** - Perfect for "active users" metrics
2. **Autumn's set_usage flag** - Essential for "current value" metrics like storage
3. **Both use JSONB properties** - Flexibility for future requirements
4. **Unique constraints over application logic** - Database guarantees > code checks
5. **Batch operations are critical** - Individual inserts don't scale

### 📁 Reference Files

**Flowglad Key Files:**
- Schema: `/flowglad/platform/flowglad-next/src/db/schema/usageEvents.ts`
- Router: `/flowglad/platform/flowglad-next/src/server/routers/usageEventsRouter.ts`
- Helpers: `/flowglad/platform/flowglad-next/src/utils/usage/usageEventHelpers.ts`

**Autumn Key Files:**
- Event Model: `/autumn/shared/models/eventModels/eventTable.ts`
- Cache Manager: `/autumn/server/src/utils/cacheUtils/CacheManager.ts`
- Track Handler: `/autumn/server/src/internal/balances/handlers/handleTrack.ts`
- Tests: `/autumn/server/tests/advanced/usage/`

These production-tested patterns have been proven at scale and will significantly improve BillingOS's metering reliability and performance.