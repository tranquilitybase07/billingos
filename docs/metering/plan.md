# Metering Implementation Plan

## Overview

The metering system enables usage-based billing through feature gating, usage tracking, idempotent event processing, and merchant analytics.

## Architecture

### SDK Flow (Browser)
```
React App → BillingOS SDK (session token) → /v1/features/* → features.service.ts
```

### SDK Flow (Node.js Server)
```
Server → @billingos/node (API secret key) → /v1/usage/* → features.service.ts
```

### Database Tables
- `features` — Feature definitions (boolean_flag, usage_quota, numeric_limit)
- `feature_grants` — Links customers to features via subscriptions
- `usage_records` — Current period consumption per customer per feature
- `idempotency_keys` — Deduplication for usage tracking events (24h TTL)

## Endpoints

### Session Token Auth (/v1/features/*)
- `GET /v1/features/check?feature_key=` — Check feature access
- `POST /v1/features/track-usage` — Track usage event
- `GET /v1/features/entitlements` — List customer entitlements
- `GET /v1/features/usage-metrics?feature_key=` — Get usage metrics

### API Key Auth (/v1/usage/*)
- `POST /v1/usage/track` — Track usage (customer_id in body)
- `GET /v1/usage/check?customer_id=&feature_key=` — Check access
- `GET /v1/usage/metrics?customer_id=&feature_key=` — Get metrics

### Merchant Analytics (/analytics/usage/*)
- `GET /analytics/usage/overview` — Summary cards
- `GET /analytics/usage/by-feature` — Per-feature breakdown
- `GET /analytics/usage/at-risk` — Customers near limits
- `GET /analytics/usage/trends` — Historical usage trends

## Key Decisions
- Idempotency uses DB table instead of Redis (simpler, sufficient for current scale)
- Usage records auto-created on first trackUsage call if missing
- At-risk threshold defaults to 80% usage
- All analytics cached for 5 minutes
