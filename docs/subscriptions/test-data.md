# Subscription Management API - Test Data & Routes

**Date:** January 5, 2026
**Purpose:** Test data for manual testing and integration tests

---

## Test Environment Setup

### Prerequisites

```bash
# 1. Start Supabase
supabase start

# 2. Start API server
cd apps/api
pnpm dev

# 3. Start Stripe CLI for webhooks
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# 4. Get test tokens
# Login to get JWT token for organization
```

### Environment Variables

```env
# API
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Redis
REDIS_URL=redis://localhost:6379
```

---

## Test Data

### 1. Test Organization

**Assumed to exist from previous setup:**
```json
{
  "id": "org-uuid-123",
  "name": "Acme Inc",
  "stripe_account_id": "acct_test_123"
}
```

### 2. Test Customer

**Create via Customers API (assumed to exist):**
```json
{
  "id": "cust-uuid-456",
  "organization_id": "org-uuid-123",
  "email": "john@example.com",
  "name": "John Doe",
  "stripe_customer_id": "cus_test_123"
}
```

---

## API Test Routes

### Products Module

#### 1. Create Feature (Reusable)

```bash
POST http://localhost:3001/api/features
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "api_calls_limit",
  "title": "API Calls per Month",
  "description": "Track and limit API usage",
  "type": "usage_quota",
  "properties": {
    "limit": 1000,
    "period": "month",
    "unit": "calls"
  }
}
```

**Expected Response:**
```json
{
  "id": "feature-uuid-1",
  "organization_id": "org-uuid-123",
  "name": "api_calls_limit",
  "title": "API Calls per Month",
  "description": "Track and limit API usage",
  "type": "usage_quota",
  "properties": {
    "limit": 1000,
    "period": "month",
    "unit": "calls"
  },
  "created_at": "2026-01-05T10:00:00Z"
}
```

#### 2. Create Another Feature (Boolean Flag)

```bash
POST http://localhost:3001/api/features
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "premium_support",
  "title": "Premium Support Access",
  "description": "24/7 premium support via email and chat",
  "type": "boolean_flag",
  "properties": {}
}
```

**Expected Response:**
```json
{
  "id": "feature-uuid-2",
  "organization_id": "org-uuid-123",
  "name": "premium_support",
  "title": "Premium Support Access",
  "type": "boolean_flag",
  "properties": {},
  "created_at": "2026-01-05T10:00:00Z"
}
```

#### 3. Create Feature with Numeric Limit

```bash
POST http://localhost:3001/api/features
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "projects_limit",
  "title": "Maximum Projects",
  "description": "Number of projects you can create",
  "type": "numeric_limit",
  "properties": {
    "limit": 10,
    "unit": "projects"
  }
}
```

#### 4. List All Features

```bash
GET http://localhost:3001/api/features?organization_id=org-uuid-123
Authorization: Bearer <jwt_token>
```

**Expected Response:**
```json
{
  "features": [
    {
      "id": "feature-uuid-1",
      "name": "api_calls_limit",
      "title": "API Calls per Month",
      "type": "usage_quota",
      "properties": {...}
    },
    {
      "id": "feature-uuid-2",
      "name": "premium_support",
      "title": "Premium Support Access",
      "type": "boolean_flag",
      "properties": {}
    },
    {
      "id": "feature-uuid-3",
      "name": "projects_limit",
      "title": "Maximum Projects",
      "type": "numeric_limit",
      "properties": {...}
    }
  ]
}
```

#### 5. Create Product (Atomic - with prices and features)

```bash
POST http://localhost:3001/api/products
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Starter Plan",
  "description": "Perfect for individuals and small teams",
  "recurring_interval": "month",
  "recurring_interval_count": 1,
  "trial_days": 14,
  "prices": [
    {
      "amount_type": "fixed",
      "price_amount": 1900,
      "price_currency": "usd"
    }
  ],
  "features": [
    {
      "feature_id": "feature-uuid-1",
      "display_order": 1
    },
    {
      "feature_id": "feature-uuid-3",
      "display_order": 2
    }
  ]
}
```

**Expected Response:**
```json
{
  "id": "product-uuid-1",
  "organization_id": "org-uuid-123",
  "name": "Starter Plan",
  "description": "Perfect for individuals and small teams",
  "recurring_interval": "month",
  "recurring_interval_count": 1,
  "trial_days": 14,
  "stripe_product_id": "prod_test_123",
  "is_archived": false,
  "prices": [
    {
      "id": "price-uuid-1",
      "product_id": "product-uuid-1",
      "amount_type": "fixed",
      "price_amount": 1900,
      "price_currency": "usd",
      "stripe_price_id": "price_test_123",
      "is_archived": false,
      "created_at": "2026-01-05T10:00:00Z"
    }
  ],
  "features": [
    {
      "id": "feature-uuid-1",
      "name": "api_calls_limit",
      "title": "API Calls per Month",
      "type": "usage_quota",
      "display_order": 1,
      "properties": {
        "limit": 1000,
        "period": "month",
        "unit": "calls"
      },
      "config": {}
    },
    {
      "id": "feature-uuid-3",
      "name": "projects_limit",
      "title": "Maximum Projects",
      "type": "numeric_limit",
      "display_order": 2,
      "properties": {
        "limit": 10,
        "unit": "projects"
      },
      "config": {}
    }
  ],
  "created_at": "2026-01-05T10:00:00Z",
  "updated_at": "2026-01-05T10:00:00Z"
}
```

#### 6. Create Pro Plan (with multiple prices and feature overrides)

```bash
POST http://localhost:3001/api/products
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Pro Plan",
  "description": "Professional features for growing teams",
  "recurring_interval": "month",
  "recurring_interval_count": 1,
  "trial_days": 14,
  "prices": [
    {
      "amount_type": "fixed",
      "price_amount": 2900,
      "price_currency": "usd"
    },
    {
      "amount_type": "fixed",
      "price_amount": 29000,
      "price_currency": "usd",
      "recurring_interval": "year"
    }
  ],
  "features": [
    {
      "feature_id": "feature-uuid-1",
      "display_order": 1,
      "config": {
        "limit": 5000
      }
    },
    {
      "feature_id": "feature-uuid-2",
      "display_order": 2
    },
    {
      "feature_id": "feature-uuid-3",
      "display_order": 3,
      "config": {
        "limit": 50
      }
    }
  ]
}
```

**Note:** Pro Plan has higher limits (5000 API calls vs 1000, 50 projects vs 10)

#### 7. Create Free Plan

```bash
POST http://localhost:3001/api/products
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Free Plan",
  "description": "Try BillingOS for free",
  "recurring_interval": "month",
  "recurring_interval_count": 1,
  "trial_days": 0,
  "prices": [
    {
      "amount_type": "free",
      "price_currency": "usd"
    }
  ],
  "features": [
    {
      "feature_id": "feature-uuid-1",
      "display_order": 1,
      "config": {
        "limit": 100
      }
    }
  ]
}
```

#### 8. List Products (for Pricing Table)

```bash
GET http://localhost:3001/api/products?organization_id=org-uuid-123&include_features=true&include_prices=true
Authorization: Bearer <jwt_token>
```

**Expected Response (Pricing Table Format):**
```json
{
  "products": [
    {
      "id": "product-uuid-3",
      "name": "Free Plan",
      "description": "Try BillingOS for free",
      "recurring_interval": "month",
      "prices": [
        {
          "id": "price-uuid-5",
          "amount_type": "free",
          "price_amount": null,
          "price_currency": "usd"
        }
      ],
      "features": [
        {
          "title": "100 API Calls per Month",
          "type": "usage_quota",
          "display_order": 1
        }
      ]
    },
    {
      "id": "product-uuid-1",
      "name": "Starter Plan",
      "description": "Perfect for individuals and small teams",
      "recurring_interval": "month",
      "prices": [
        {
          "id": "price-uuid-1",
          "amount_type": "fixed",
          "price_amount": 1900,
          "price_currency": "usd"
        }
      ],
      "features": [
        {
          "title": "1,000 API Calls per Month",
          "type": "usage_quota",
          "display_order": 1
        },
        {
          "title": "Maximum Projects",
          "type": "numeric_limit",
          "display_order": 2
        }
      ]
    },
    {
      "id": "product-uuid-2",
      "name": "Pro Plan",
      "description": "Professional features for growing teams",
      "recurring_interval": "month",
      "prices": [
        {
          "id": "price-uuid-2",
          "amount_type": "fixed",
          "price_amount": 2900,
          "price_currency": "usd"
        },
        {
          "id": "price-uuid-3",
          "amount_type": "fixed",
          "price_amount": 29000,
          "price_currency": "usd"
        }
      ],
      "features": [
        {
          "title": "5,000 API Calls per Month",
          "type": "usage_quota",
          "display_order": 1
        },
        {
          "title": "Premium Support Access",
          "type": "boolean_flag",
          "display_order": 2
        },
        {
          "title": "50 Projects",
          "type": "numeric_limit",
          "display_order": 3
        }
      ]
    }
  ]
}
```

#### 9. Get Single Product

```bash
GET http://localhost:3001/api/products/product-uuid-2
Authorization: Bearer <jwt_token>
```

#### 10. Update Product

```bash
PATCH http://localhost:3001/api/products/product-uuid-2
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Pro Plan - Updated",
  "description": "New and improved professional features"
}
```

#### 11. Archive Product

```bash
DELETE http://localhost:3001/api/products/product-uuid-1
Authorization: Bearer <jwt_token>
```

---

### Subscriptions Module

#### 12. Create Subscription

```bash
POST http://localhost:3001/api/subscriptions
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "product_id": "product-uuid-2",
  "price_id": "price-uuid-2"
}
```

**Expected Response:**
```json
{
  "id": "sub-uuid-1",
  "organization_id": "org-uuid-123",
  "customer_id": "cust-uuid-456",
  "product_id": "product-uuid-2",
  "status": "active",
  "amount": 2900,
  "currency": "usd",
  "current_period_start": "2026-01-05T10:00:00Z",
  "current_period_end": "2026-02-05T10:00:00Z",
  "trial_start": null,
  "trial_end": null,
  "cancel_at_period_end": false,
  "canceled_at": null,
  "stripe_subscription_id": "sub_test_123",
  "granted_features": [
    {
      "id": "grant-uuid-1",
      "feature_id": "feature-uuid-1",
      "name": "api_calls_limit",
      "title": "5,000 API Calls per Month",
      "type": "usage_quota",
      "granted_at": "2026-01-05T10:00:00Z",
      "revoked_at": null,
      "properties": {
        "limit": 5000,
        "period": "month",
        "unit": "calls",
        "consumed": 0,
        "remaining": 5000
      }
    },
    {
      "id": "grant-uuid-2",
      "feature_id": "feature-uuid-2",
      "name": "premium_support",
      "title": "Premium Support Access",
      "type": "boolean_flag",
      "granted_at": "2026-01-05T10:00:00Z",
      "revoked_at": null,
      "properties": {}
    },
    {
      "id": "grant-uuid-3",
      "feature_id": "feature-uuid-3",
      "name": "projects_limit",
      "title": "50 Projects",
      "type": "numeric_limit",
      "granted_at": "2026-01-05T10:00:00Z",
      "revoked_at": null,
      "properties": {
        "limit": 50,
        "unit": "projects"
      }
    }
  ],
  "created_at": "2026-01-05T10:00:00Z",
  "updated_at": "2026-01-05T10:00:00Z"
}
```

**Backend Actions:**
1. ✅ Created subscription in Stripe
2. ✅ Cached subscription in PostgreSQL
3. ✅ Created 3 feature_grant records
4. ✅ Created usage_record for api_calls_limit (quota feature)
5. ✅ Invalidated Redis cache for customer

#### 13. Get Subscription

```bash
GET http://localhost:3001/api/subscriptions/sub-uuid-1
Authorization: Bearer <jwt_token>
```

#### 14. List Customer Subscriptions

```bash
GET http://localhost:3001/api/subscriptions?customer_id=cust-uuid-456
Authorization: Bearer <jwt_token>
```

#### 15. Cancel Subscription (at period end)

```bash
POST http://localhost:3001/api/subscriptions/sub-uuid-1/cancel
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "cancel_at_period_end": true
}
```

**Expected Response:**
```json
{
  "id": "sub-uuid-1",
  "status": "active",
  "cancel_at_period_end": true,
  "canceled_at": "2026-01-05T10:30:00Z",
  "current_period_end": "2026-02-05T10:00:00Z"
}
```

**Note:** Features remain active until period ends (2026-02-05)

#### 16. Cancel Subscription (immediately)

```bash
POST http://localhost:3001/api/subscriptions/sub-uuid-1/cancel
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "cancel_at_period_end": false
}
```

**Expected Response:**
```json
{
  "id": "sub-uuid-1",
  "status": "canceled",
  "cancel_at_period_end": false,
  "canceled_at": "2026-01-05T10:30:00Z",
  "granted_features": [
    {
      "feature_id": "feature-uuid-1",
      "revoked_at": "2026-01-05T10:30:00Z"
    },
    {
      "feature_id": "feature-uuid-2",
      "revoked_at": "2026-01-05T10:30:00Z"
    },
    {
      "feature_id": "feature-uuid-3",
      "revoked_at": "2026-01-05T10:30:00Z"
    }
  ]
}
```

**Backend Actions:**
1. ✅ Canceled subscription in Stripe
2. ✅ Updated status in PostgreSQL
3. ✅ Revoked all feature grants (set revoked_at)
4. ✅ Invalidated Redis cache

---

### Features Module (SDK Endpoints)

#### 17. Check Feature Access (Has Access)

```bash
GET http://localhost:3001/api/features/check?customer_id=cust-uuid-456&feature_name=api_calls_limit
Authorization: Bearer <sdk_access_token>
```

**Expected Response:**
```json
{
  "has_access": true,
  "feature": {
    "id": "feature-uuid-1",
    "name": "api_calls_limit",
    "type": "usage_quota",
    "properties": {
      "limit": 5000,
      "consumed": 0,
      "remaining": 5000,
      "period": "month",
      "unit": "calls",
      "resets_at": "2026-02-05T10:00:00Z"
    }
  }
}
```

**Cache:** Stored in Redis with 5-minute TTL

#### 18. Check Feature Access (No Subscription)

```bash
GET http://localhost:3001/api/features/check?customer_id=cust-uuid-999&feature_name=api_calls_limit
Authorization: Bearer <sdk_access_token>
```

**Expected Response:**
```json
{
  "has_access": false,
  "reason": "no_active_subscription",
  "feature": null
}
```

#### 19. Check Boolean Feature

```bash
GET http://localhost:3001/api/features/check?customer_id=cust-uuid-456&feature_name=premium_support
Authorization: Bearer <sdk_access_token>
```

**Expected Response:**
```json
{
  "has_access": true,
  "feature": {
    "id": "feature-uuid-2",
    "name": "premium_support",
    "type": "boolean_flag",
    "properties": {}
  }
}
```

#### 20. Track Usage (First Call)

```bash
POST http://localhost:3001/api/features/track-usage
Authorization: Bearer <sdk_access_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "feature_name": "api_calls_limit",
  "units": 1
}
```

**Expected Response:**
```json
{
  "success": true,
  "feature": {
    "name": "api_calls_limit",
    "type": "usage_quota"
  },
  "usage": {
    "consumed_units": 1,
    "limit_units": 5000,
    "remaining_units": 4999,
    "period_start": "2026-01-05T10:00:00Z",
    "period_end": "2026-02-05T10:00:00Z"
  }
}
```

**Backend Actions:**
1. ✅ Atomically incremented consumed_units in PostgreSQL
2. ✅ Checked limit (1 < 5000 ✓)
3. ✅ Invalidated Redis cache for feature check

#### 21. Track Usage (Multiple Units)

```bash
POST http://localhost:3001/api/features/track-usage
Authorization: Bearer <sdk_access_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "feature_name": "api_calls_limit",
  "units": 10
}
```

**Expected Response:**
```json
{
  "success": true,
  "usage": {
    "consumed_units": 11,
    "limit_units": 5000,
    "remaining_units": 4989
  }
}
```

#### 22. Track Usage (Exceeds Limit)

**Setup:** First, consume all units:
```bash
POST http://localhost:3001/api/features/track-usage
Authorization: Bearer <sdk_access_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "feature_name": "api_calls_limit",
  "units": 4990
}
```

**Then try to exceed:**
```bash
POST http://localhost:3001/api/features/track-usage
Authorization: Bearer <sdk_access_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "feature_name": "api_calls_limit",
  "units": 1
}
```

**Expected Response:** 400 Bad Request
```json
{
  "statusCode": 400,
  "error": "quota_exceeded",
  "message": "Usage limit reached for api_calls_limit",
  "details": {
    "feature": {
      "name": "api_calls_limit",
      "type": "usage_quota"
    },
    "usage": {
      "consumed_units": 5000,
      "limit_units": 5000,
      "remaining_units": 0,
      "resets_at": "2026-02-05T10:00:00Z"
    }
  }
}
```

#### 23. Track Usage (Idempotency)

```bash
POST http://localhost:3001/api/features/track-usage
Authorization: Bearer <sdk_access_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "feature_name": "api_calls_limit",
  "units": 1,
  "idempotency_key": "unique-key-123"
}
```

**Call again with same key:**
```bash
POST http://localhost:3001/api/features/track-usage
Authorization: Bearer <sdk_access_token>
Content-Type: application/json

{
  "customer_id": "cust-uuid-456",
  "feature_name": "api_calls_limit",
  "units": 1,
  "idempotency_key": "unique-key-123"
}
```

**Expected:** Second call returns same result, doesn't double-count

---

## Stripe Webhook Testing

### Trigger Webhooks via Stripe CLI

```bash
# Terminal 1: Listen for webhooks
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Terminal 2: Trigger test events
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

### Expected Webhook Handling

#### subscription.created
- Cache subscription in DB
- Grant features to customer
- Initialize usage records

#### subscription.updated
- Update cached subscription
- Check if new billing period started → reset usage records
- Invalidate Redis cache

#### subscription.deleted
- Update status to 'canceled'
- Revoke all feature grants
- Invalidate Redis cache

---

## Integration Test Scenarios

### Scenario 1: Complete Product-to-Subscription Flow

```bash
# 1. Create features
POST /api/features (create "api_calls_limit")
POST /api/features (create "premium_support")

# 2. Create product
POST /api/products (with both features)

# 3. Verify product in list
GET /api/products

# 4. Create subscription
POST /api/subscriptions

# 5. Check feature access
GET /api/features/check?customer_id=X&feature_name=api_calls_limit
→ Expect: has_access = true, remaining = 5000

# 6. Track usage
POST /api/features/track-usage (units: 100)

# 7. Check feature access again
GET /api/features/check?customer_id=X&feature_name=api_calls_limit
→ Expect: consumed = 100, remaining = 4900

# 8. Cancel subscription
POST /api/subscriptions/:id/cancel (immediate)

# 9. Check feature access after cancellation
GET /api/features/check?customer_id=X&feature_name=api_calls_limit
→ Expect: has_access = false
```

### Scenario 2: Usage Limit Enforcement

```bash
# 1. Create subscription with 100 API call limit (Free Plan)
POST /api/subscriptions (product: Free Plan)

# 2. Consume 99 units
POST /api/features/track-usage (units: 99)

# 3. Check remaining
GET /api/features/check
→ Expect: remaining = 1

# 4. Try to consume 2 units
POST /api/features/track-usage (units: 2)
→ Expect: 400 quota_exceeded

# 5. Consume exactly 1 unit
POST /api/features/track-usage (units: 1)
→ Expect: 200 OK, remaining = 0

# 6. Try to consume any more
POST /api/features/track-usage (units: 1)
→ Expect: 400 quota_exceeded
```

### Scenario 3: Feature Configuration Override

```bash
# 1. Same feature attached to 3 products with different limits
# Free: 100 calls, Starter: 1000 calls, Pro: 5000 calls

# 2. Create subscription to Free Plan
POST /api/subscriptions (product: Free Plan)

# 3. Check limit
GET /api/features/check
→ Expect: limit = 100

# 4. Upgrade to Starter Plan (cancel + create new)
POST /api/subscriptions/:id/cancel
POST /api/subscriptions (product: Starter Plan)

# 5. Check limit again
GET /api/features/check
→ Expect: limit = 1000, consumed = 0 (reset on new subscription)
```

---

## Postman Collection

**Import this into Postman:**

```json
{
  "info": {
    "name": "BillingOS - Subscriptions API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3001/api"
    },
    {
      "key": "jwt_token",
      "value": "your-jwt-token-here"
    },
    {
      "key": "organization_id",
      "value": "org-uuid-123"
    },
    {
      "key": "customer_id",
      "value": "cust-uuid-456"
    },
    {
      "key": "feature_id_1",
      "value": ""
    },
    {
      "key": "product_id_1",
      "value": ""
    },
    {
      "key": "subscription_id_1",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Features",
      "item": [
        {
          "name": "Create Feature - API Calls Limit",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"api_calls_limit\",\n  \"title\": \"API Calls per Month\",\n  \"description\": \"Track and limit API usage\",\n  \"type\": \"usage_quota\",\n  \"properties\": {\n    \"limit\": 1000,\n    \"period\": \"month\",\n    \"unit\": \"calls\"\n  }\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            },
            "url": {
              "raw": "{{base_url}}/features",
              "host": ["{{base_url}}"],
              "path": ["features"]
            }
          }
        },
        {
          "name": "List Features",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/features?organization_id={{organization_id}}",
              "host": ["{{base_url}}"],
              "path": ["features"],
              "query": [
                {
                  "key": "organization_id",
                  "value": "{{organization_id}}"
                }
              ]
            }
          }
        },
        {
          "name": "Check Feature Access",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/features/check?customer_id={{customer_id}}&feature_name=api_calls_limit",
              "host": ["{{base_url}}"],
              "path": ["features", "check"],
              "query": [
                {
                  "key": "customer_id",
                  "value": "{{customer_id}}"
                },
                {
                  "key": "feature_name",
                  "value": "api_calls_limit"
                }
              ]
            }
          }
        },
        {
          "name": "Track Usage",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"customer_id\": \"{{customer_id}}\",\n  \"feature_name\": \"api_calls_limit\",\n  \"units\": 1\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            },
            "url": {
              "raw": "{{base_url}}/features/track-usage",
              "host": ["{{base_url}}"],
              "path": ["features", "track-usage"]
            }
          }
        }
      ]
    },
    {
      "name": "Products",
      "item": [
        {
          "name": "Create Product - Pro Plan",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Pro Plan\",\n  \"description\": \"Professional features for growing teams\",\n  \"recurring_interval\": \"month\",\n  \"recurring_interval_count\": 1,\n  \"trial_days\": 14,\n  \"prices\": [\n    {\n      \"amount_type\": \"fixed\",\n      \"price_amount\": 2900,\n      \"price_currency\": \"usd\"\n    }\n  ],\n  \"features\": [\n    {\n      \"feature_id\": \"{{feature_id_1}}\",\n      \"display_order\": 1,\n      \"config\": {\"limit\": 5000}\n    }\n  ]\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            },
            "url": {
              "raw": "{{base_url}}/products",
              "host": ["{{base_url}}"],
              "path": ["products"]
            }
          }
        },
        {
          "name": "List Products",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/products?organization_id={{organization_id}}&include_features=true&include_prices=true",
              "host": ["{{base_url}}"],
              "path": ["products"],
              "query": [
                {
                  "key": "organization_id",
                  "value": "{{organization_id}}"
                },
                {
                  "key": "include_features",
                  "value": "true"
                },
                {
                  "key": "include_prices",
                  "value": "true"
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "Subscriptions",
      "item": [
        {
          "name": "Create Subscription",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"customer_id\": \"{{customer_id}}\",\n  \"product_id\": \"{{product_id_1}}\",\n  \"price_id\": \"price-uuid\"\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            },
            "url": {
              "raw": "{{base_url}}/subscriptions",
              "host": ["{{base_url}}"],
              "path": ["subscriptions"]
            }
          }
        },
        {
          "name": "Get Subscription",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "url": {
              "raw": "{{base_url}}/subscriptions/{{subscription_id_1}}",
              "host": ["{{base_url}}"],
              "path": ["subscriptions", "{{subscription_id_1}}"]
            }
          }
        },
        {
          "name": "Cancel Subscription",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{jwt_token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"cancel_at_period_end\": false\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            },
            "url": {
              "raw": "{{base_url}}/subscriptions/{{subscription_id_1}}/cancel",
              "host": ["{{base_url}}"],
              "path": ["subscriptions", "{{subscription_id_1}}", "cancel"]
            }
          }
        }
      ]
    }
  ]
}
```

---

## Database Queries for Verification

### Check Product with Features

```sql
SELECT
  p.*,
  json_agg(
    json_build_object(
      'feature_id', f.id,
      'name', f.name,
      'title', f.title,
      'display_order', pf.display_order,
      'config', pf.config,
      'properties', f.properties
    ) ORDER BY pf.display_order
  ) as features
FROM products p
LEFT JOIN product_features pf ON pf.product_id = p.id
LEFT JOIN features f ON f.id = pf.feature_id
WHERE p.id = 'product-uuid-here'
GROUP BY p.id;
```

### Check Active Feature Grants for Customer

```sql
SELECT
  fg.*,
  f.name,
  f.title,
  f.type,
  s.status as subscription_status
FROM feature_grants fg
JOIN features f ON f.id = fg.feature_id
JOIN subscriptions s ON s.id = fg.subscription_id
WHERE fg.customer_id = 'customer-uuid-here'
  AND fg.revoked_at IS NULL
  AND s.status = 'active';
```

### Check Usage Records

```sql
SELECT
  ur.*,
  f.name as feature_name,
  f.title as feature_title,
  (ur.limit_units - ur.consumed_units) as remaining_units
FROM usage_records ur
JOIN features f ON f.id = ur.feature_id
WHERE ur.customer_id = 'customer-uuid-here'
  AND ur.period_start <= NOW()
  AND ur.period_end >= NOW();
```

---

## Redis Cache Verification

### Check Cached Feature Access

```bash
# Connect to Redis
redis-cli

# Check if key exists
EXISTS feature:check:cust-uuid-456:api_calls_limit

# Get cached value
GET feature:check:cust-uuid-456:api_calls_limit

# Check TTL
TTL feature:check:cust-uuid-456:api_calls_limit
```

### Invalidate Cache Manually

```bash
# Delete specific feature check
DEL feature:check:cust-uuid-456:api_calls_limit

# Delete all caches for customer
KEYS feature:check:cust-uuid-456:*
# Then DEL each key
```

---

## Error Scenarios to Test

1. **Create product with non-existent feature** → 404 Feature Not Found
2. **Create subscription with non-existent customer** → 404 Customer Not Found
3. **Track usage for customer without subscription** → 400 No Active Subscription
4. **Track usage exceeding limit** → 400 Quota Exceeded
5. **Create product without prices** → 400 Validation Error
6. **Create subscription without payment method** → 400 Payment Method Required
7. **Check feature for non-existent customer** → 404 Customer Not Found

---

**Last Updated:** January 5, 2026
**Status:** Ready for testing after implementation
