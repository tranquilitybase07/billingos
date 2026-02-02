# Product Versioning System Design

**Version**: 1.0
**Date**: February 2, 2026
**Status**: Design Phase
**Authors**: Engineering Team

---

## 1. System Overview

### Current State

BillingOS currently implements a **single-version product system** where:
- Products have one active price at a time
- Price changes create new prices but don't protect existing customers
- Feature limit changes apply globally without protection
- No tracking of product evolution history

### Target State

Implement an **automatic versioning system** that:
- Creates new product versions when prices or limits change with existing customers
- Protects existing customers on their original version (grandfathered)
- Provides migration tools to transition customers between versions
- Tracks complete version history with analytics

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend UI                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Product  │  │ Version  │  │Migration │  │Analytics │   │
│  │  Editor  │  │  Warning │  │  Wizard  │  │Dashboard │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (NestJS)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Products   │  │  Versioning  │  │  Migration   │      │
│  │   Service    │  │    Service   │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  products  │  │  product   │  │ migration  │            │
│  │ (versioned)│  │  versions  │  │   queue    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Stripe Connect                          │
│         Products & Prices with version metadata              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Database Design Changes

### Current Schema Issues

**products table** currently lacks:
- Version tracking
- Parent-child relationships
- Version metadata

### Required Schema Changes

#### 2.1 Modify Products Table

```sql
-- Add versioning columns to products table
ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN parent_product_id UUID REFERENCES products(id);
ALTER TABLE products ADD COLUMN latest_version_id UUID REFERENCES products(id);
ALTER TABLE products ADD COLUMN version_status VARCHAR(20) DEFAULT 'current';
-- Values: 'current', 'superseded', 'deprecated'
ALTER TABLE products ADD COLUMN version_created_reason TEXT;
ALTER TABLE products ADD COLUMN version_created_at TIMESTAMPTZ DEFAULT NOW();

-- Add composite unique constraint
ALTER TABLE products ADD CONSTRAINT products_org_name_version_unique
  UNIQUE (organization_id, name, version);

-- Add check to prevent version cycles
ALTER TABLE products ADD CONSTRAINT no_self_parent
  CHECK (parent_product_id != id);
```

#### 2.2 Create Product Versions View

```sql
-- Materialized view for version analytics
CREATE MATERIALIZED VIEW product_version_analytics AS
SELECT
  p.organization_id,
  p.name as product_name,
  p.version,
  p.version_status,
  COUNT(DISTINCT s.id) as subscription_count,
  SUM(s.amount) as total_mrr,
  p.created_at as version_created_at
FROM products p
LEFT JOIN subscriptions s ON s.product_id = p.id AND s.status = 'active'
GROUP BY p.organization_id, p.name, p.version, p.version_status, p.created_at;

-- Refresh strategy: Daily or on-demand
CREATE INDEX idx_pva_org_product ON product_version_analytics(organization_id, product_name);
```

#### 2.3 Migration Queue Table (Phase 2)

```sql
CREATE TABLE product_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  from_product_id UUID NOT NULL REFERENCES products(id),
  to_product_id UUID NOT NULL REFERENCES products(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Values: 'pending', 'processing', 'completed', 'failed'
  migration_type VARCHAR(20) NOT NULL DEFAULT 'immediate',
  -- Values: 'immediate', 'at_renewal'
  customer_filter JSONB, -- Optional customer IDs or criteria
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  statistics JSONB, -- Success/failure counts
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Data Migration Strategy

```sql
-- One-time migration to set initial version for existing products
UPDATE products SET version = 1 WHERE version IS NULL;
```

---

## 3. API Design Changes

### 3.1 Modified Endpoints

#### PATCH /products/:id - Enhanced Update

**Current Behavior**: Updates product directly
**New Behavior**: Auto-versions if needed

```typescript
// Pseudo code for version detection
function updateProduct(productId, updateDto) {
  product = getProduct(productId)
  subscriptionCount = getSubscriptionCount(productId)

  if (subscriptionCount > 0) {
    changeAnalysis = analyzeChanges(product, updateDto)

    if (changeAnalysis.requiresVersioning) {
      // Auto-create new version
      return createProductVersion(product, updateDto)
    }
  }

  // Safe in-place update
  return updateProductInPlace(product, updateDto)
}

// Change analysis algorithm
function analyzeChanges(currentProduct, updateDto) {
  requiresVersioning = false

  // Check price changes
  if (updateDto.prices?.create || updateDto.prices?.archive) {
    requiresVersioning = true
  }

  // Check feature limit reductions
  if (updateDto.features?.update) {
    for (featureUpdate of updateDto.features.update) {
      currentConfig = getFeatureConfig(productId, featureUpdate.feature_id)
      if (featureUpdate.config?.limit < currentConfig?.limit) {
        requiresVersioning = true
      }
    }
  }

  return { requiresVersioning, changes: [...] }
}
```

### 3.2 New Endpoints

#### GET /products/:id/versions
List all versions of a product

```typescript
Response: {
  versions: [
    {
      id: "uuid-v3",
      version: 3,
      status: "current",
      subscription_count: 450,
      monthly_revenue: 6750.00,
      created_at: "2026-02-01",
      created_reason: "Price increase from $10 to $15"
    },
    {
      id: "uuid-v2",
      version: 2,
      status: "superseded",
      subscription_count: 200,
      monthly_revenue: 2000.00
    },
    {
      id: "uuid-v1",
      version: 1,
      status: "superseded",
      subscription_count: 100,
      monthly_revenue: 1000.00
    }
  ],
  total_subscriptions: 750,
  total_monthly_revenue: 9750.00,
  potential_revenue_if_migrated: 11250.00
}
```

#### POST /products/:id/migrate (Phase 2)
Migrate customers between versions

```typescript
Request: {
  to_version_id: "uuid-v3",
  customer_ids?: ["cust1", "cust2"], // Optional filter
  migration_type: "at_renewal", // or "immediate"
  notification_options?: {
    send_email: true,
    template_id: "price_change_notification"
  }
}

Response: {
  migration_id: "mig_123",
  affected_customers: 100,
  estimated_revenue_change: 500.00,
  estimated_completion: "2026-03-01"
}
```

#### GET /products/:id/migration-preview
Preview migration impact

```typescript
Response: {
  current_version: { version: 1, price: 10.00, customers: 100 },
  target_version: { version: 3, price: 15.00 },
  impact: {
    revenue_change: {
      immediate: 500.00,
      monthly: 500.00,
      annual: 6000.00
    },
    proration: {
      total_charges: 250.00,
      total_credits: 0
    },
    risk_assessment: {
      estimated_churn_rate: 0.05,
      at_risk_customers: 5
    }
  }
}
```

### 3.3 Response Changes

All product responses will include version information:

```typescript
{
  id: "prod_123",
  name: "Pro Plan",
  version: 2,                    // NEW
  version_status: "current",     // NEW
  parent_product_id: "prod_122", // NEW
  latest_version_id: "prod_123", // NEW
  has_active_subscriptions: true,// NEW
  // ... existing fields
}
```

---

## 4. Business Logic Changes

### 4.1 Auto-Versioning Algorithm

```
ALGORITHM: DetermineVersioningNeed
INPUT: currentProduct, proposedChanges, subscriptionCount
OUTPUT: shouldVersion (boolean), reason (string)

BEGIN
  shouldVersion = FALSE
  reasons = []

  IF subscriptionCount == 0 THEN
    RETURN (FALSE, "No active subscriptions")
  END IF

  // Check price changes
  IF proposedChanges.prices.create EXISTS OR
     proposedChanges.prices.archive EXISTS THEN
    shouldVersion = TRUE
    reasons.ADD("Price change detected")
  END IF

  // Check feature limit reductions
  FOR EACH feature IN proposedChanges.features.update DO
    currentLimit = GET_FEATURE_LIMIT(currentProduct, feature.id)
    newLimit = feature.config.limit

    IF newLimit < currentLimit THEN
      shouldVersion = TRUE
      reasons.ADD("Feature limit reduced: " + feature.name)
    END IF
  END FOR

  // Check feature removals
  IF proposedChanges.features.unlink EXISTS THEN
    shouldVersion = TRUE
    reasons.ADD("Features removed from product")
  END IF

  // Check trial period reduction
  IF proposedChanges.trial_days < currentProduct.trial_days THEN
    shouldVersion = TRUE
    reasons.ADD("Trial period reduced")
  END IF

  RETURN (shouldVersion, JOIN(reasons, ", "))
END
```

### 4.2 Version Creation Process

```
ALGORITHM: CreateProductVersion
INPUT: currentProduct, changes
OUTPUT: newProduct

BEGIN
  // Calculate new version number
  latestVersion = GET_MAX_VERSION(currentProduct.organization_id, currentProduct.name)
  newVersion = latestVersion + 1

  // Create new product with incremented version
  newProduct = CREATE_PRODUCT({
    ...currentProduct,
    ...changes,
    id: GENERATE_UUID(),
    version: newVersion,
    parent_product_id: currentProduct.id,
    version_created_reason: GENERATE_REASON(changes),
    version_created_at: NOW(),
    version_status: 'current'
  })

  // Update old product status
  UPDATE_PRODUCT(currentProduct.id, {
    version_status: 'superseded',
    latest_version_id: newProduct.id
  })

  // Sync to Stripe with version metadata
  stripeProduct = CREATE_STRIPE_PRODUCT({
    name: currentProduct.name + " (v" + newVersion + ")",
    metadata: {
      billingos_version: newVersion,
      billingos_parent_id: currentProduct.id,
      billingos_product_id: newProduct.id
    }
  })

  // Update new product with Stripe ID
  UPDATE_PRODUCT(newProduct.id, {
    stripe_product_id: stripeProduct.id
  })

  RETURN newProduct
END
```

### 4.3 Migration Flow (Phase 2)

```
ALGORITHM: MigrateCustomers
INPUT: fromProduct, toProduct, customerFilter, migrationType
OUTPUT: migrationResult

BEGIN
  migration = CREATE_MIGRATION_RECORD(fromProduct, toProduct, customerFilter)

  // Get affected subscriptions
  subscriptions = GET_SUBSCRIPTIONS(fromProduct.id, customerFilter)

  successCount = 0
  failureCount = 0

  FOR EACH subscription IN subscriptions DO
    TRY
      IF migrationType == 'immediate' THEN
        // Calculate proration
        proration = CALCULATE_PRORATION(subscription, toProduct)

        // Update subscription in Stripe
        STRIPE_UPDATE_SUBSCRIPTION(subscription.stripe_id, {
          items: [{
            id: subscription.stripe_item_id,
            price: toProduct.stripe_price_id
          }],
          proration_behavior: 'create_prorations'
        })

        // Update local database
        UPDATE_SUBSCRIPTION(subscription.id, {
          product_id: toProduct.id,
          amount: toProduct.price_amount
        })

      ELSE IF migrationType == 'at_renewal' THEN
        // Schedule price change for next billing cycle
        STRIPE_UPDATE_SUBSCRIPTION(subscription.stripe_id, {
          items: [{
            id: subscription.stripe_item_id,
            price: toProduct.stripe_price_id
          }],
          proration_behavior: 'none',
          billing_cycle_anchor: 'unchanged'
        })
      END IF

      successCount++

    CATCH error
      LOG_ERROR(subscription.id, error)
      failureCount++
    END TRY
  END FOR

  // Update migration record
  UPDATE_MIGRATION(migration.id, {
    status: 'completed',
    completed_at: NOW(),
    statistics: {
      success: successCount,
      failures: failureCount
    }
  })

  RETURN migrationResult
END
```

---

## 5. UI/UX Design Changes

### 5.1 Product Edit Warning Modal

**When**: User attempts to save changes that would trigger versioning

```
┌─────────────────────────────────────────────────────────────┐
│                    ⚠️  Version Warning                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your changes will create a new product version because:   │
│                                                             │
│  • Price increased from $10 to $15 (+50%)                  │
│  • API calls reduced from 2000 to 1000 (-50%)             │
│                                                             │
│  Impact:                                                    │
│  • 450 existing customers will stay on v1 ($10/mo)        │
│  • New customers will get v2 ($15/mo)                     │
│  • Revenue impact: -$2,250/mo until migration             │
│                                                             │
│  This protects your existing customers from unexpected     │
│  changes. You can migrate them later using our tools.      │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────┐    │
│  │     Cancel      │  │   Create Version 2 →        │    │
│  └─────────────────┘  └─────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Product List View Enhancement

```
┌─────────────────────────────────────────────────────────────┐
│  Products                                    [+ New Product]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Pro Plan                              [v3] Current  │  │
│  │  $15/month • 2000 API calls                         │  │
│  │  450 active subscriptions • $6,750 MRR              │  │
│  │                                                      │  │
│  │  [View Details] [Edit] [View All Versions]          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Starter Plan                          [v1] Current  │  │
│  │  $5/month • 100 API calls                           │  │
│  │  1,200 active subscriptions • $6,000 MRR            │  │
│  │                                                      │  │
│  │  [View Details] [Edit] [View All Versions]          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Version Management Page

```
┌─────────────────────────────────────────────────────────────┐
│  Pro Plan - Version History                     [← Back]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Total Customers: 750 | Total MRR: $9,750                  │
│  Potential if all on v3: $11,250 (+$1,500)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Version 3 (Current)                    Created: Feb 1│  │
│  │  $15/month • 2000 API calls                         │  │
│  │  450 customers • $6,750 MRR                         │  │
│  │  Reason: Market adjustment and feature expansion     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Version 2                              Created: Oct 1│  │
│  │  $12/month • 1500 API calls                         │  │
│  │  200 customers • $2,400 MRR                         │  │
│  │  [Migrate to v3 →]                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Version 1                              Created: Jul 1│  │
│  │  $10/month • 1000 API calls                         │  │
│  │  100 customers • $1,000 MRR                         │  │
│  │  [Migrate to v3 →]                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Bulk Migration Wizard]  [Download Report]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Migration Wizard (Phase 2)

```
┌─────────────────────────────────────────────────────────────┐
│  Migration Wizard - Pro Plan v1 → v3           Step 2 of 4 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Select Migration Timing:                                   │
│                                                             │
│  ○ Immediate (Prorated charges apply)                      │
│     Customers charged $5 difference today                   │
│     Revenue increase: $500 immediate                        │
│                                                             │
│  ● At Next Renewal                                         │
│     Price changes at each customer's billing date          │
│     No surprise charges, lower churn risk                  │
│     Full revenue impact in 30 days                         │
│                                                             │
│  ○ With Grace Period (60 days notice)                      │
│     Send notification now, change in 60 days               │
│     Most customer-friendly, delays revenue                 │
│                                                             │
│  Estimated Impact:                                          │
│  • Customers affected: 100                                 │
│  • Monthly revenue increase: $500                          │
│  • Estimated churn (5%): ~5 customers                     │
│                                                             │
│  [← Previous]                           [Next: Incentives →]│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 Customer-Facing Changes

**Subscription Page** (Customer Portal):
```
Your Subscription: Pro Plan (Grandfathered Rate)
Price: $10/month (Regular price: $15/month - You save $5!)
Features: 1000 API calls/month

[Upgrade to Latest] - Get 2000 API calls for $15/month
```

---

## 6. Stripe Integration Updates

### 6.1 Metadata Strategy

All Stripe objects will include version metadata:

```javascript
// Stripe Product Metadata
{
  "billingos_product_id": "prod_123",
  "billingos_version": "2",
  "billingos_parent_id": "prod_122",
  "billingos_org_id": "org_456"
}

// Stripe Price Metadata
{
  "billingos_price_id": "price_789",
  "billingos_product_version": "2",
  "billingos_created_at": "2026-02-01"
}

// Stripe Subscription Metadata
{
  "billingos_subscription_id": "sub_abc",
  "billingos_product_version": "1",
  "billingos_migrated_from": "v1",
  "billingos_migrated_at": "2026-02-15"
}
```

### 6.2 Naming Convention

```
Product Name: "Pro Plan (v2)"
Price Description: "Pro Plan v2 - $15/month"
```

### 6.3 Migration Handling

When migrating subscriptions:
1. Update subscription items with new price ID
2. Set proration_behavior based on migration type
3. Update metadata to track migration history
4. Handle webhooks for confirmation

---

## 7. Data Flow Diagrams

### 7.1 Product Update Flow with Versioning

```
User Action                System Process              Database Update
    │                           │                            │
    ├─[Edit Product]            │                            │
    │                           │                            │
    ├─[Submit Changes]───────▶  │                            │
    │                           ├─[Check Subscriptions]────▶ │
    │                           │◀────[Count: 450]────────── │
    │                           │                            │
    │                           ├─[Analyze Changes]          │
    │                           ├─[Price: $10→$15]          │
    │                           ├─[Limits: 2000→1000]       │
    │                           │                            │
    │                           ├─[Decision: Version]       │
    │◀──[Warning Modal]──────── │                            │
    │                           │                            │
    ├─[Confirm Version]───────▶ │                            │
    │                           ├─[Create v2]──────────────▶ │
    │                           │                            ├─[Insert Product v2]
    │                           │                            ├─[Update v1 Status]
    │                           ├─[Sync to Stripe]          │
    │                           │                            │
    │◀──[Success: v2 Created]── │                            │
    │                           │                            │
```

### 7.2 Customer Migration Flow (Phase 2)

```
Merchant                  Migration Service           Stripe API
    │                           │                          │
    ├─[Select Customers]        │                          │
    ├─[Choose Target Version]   │                          │
    ├─[Set Migration Type]      │                          │
    │                           │                          │
    ├─[Start Migration]───────▶ │                          │
    │                           ├─[Create Job]             │
    │                           ├─[Queue Processing]       │
    │                           │                          │
    │                           ├─[Process Batch]─────────▶│
    │                           │                          ├─[Update Subscriptions]
    │                           │◀─────[Confirmations]─────│
    │                           │                          │
    │                           ├─[Update Database]        │
    │                           ├─[Send Notifications]     │
    │                           │                          │
    │◀──[Migration Complete]─── │                          │
    │    [Success: 95/100]      │                          │
    │                           │                          │
```

---

## 8. Implementation Phases

### Phase 1: Core Versioning (2-3 weeks)

**Goals**:
- Protect existing customers from price/limit changes
- Implement auto-versioning logic
- Add basic UI warnings

**Deliverables**:
1. Database migrations for version fields
2. Update service with versioning logic
3. Warning modal before versioning
4. Version badges in UI
5. Basic version history page

**Success Criteria**:
- Zero unintended price changes to existing customers
- All price changes create new versions correctly
- Merchants understand versioning (>80% survey)

### Phase 2: Migration Tools (3-4 weeks)

**Goals**:
- Enable merchants to consolidate versions
- Provide revenue recovery tools
- Minimize migration friction

**Deliverables**:
1. Migration API endpoints
2. Migration wizard UI
3. Bulk migration processing
4. Customer notification system
5. Proration calculations

**Success Criteria**:
- 50% of merchants use migration tools within first month
- <10% failure rate on migrations
- Average migration completion <5 minutes

### Phase 3: Analytics Dashboard (2-3 weeks)

**Goals**:
- Provide insights on version performance
- Guide migration decisions
- Track revenue impact

**Deliverables**:
1. Version analytics API
2. Revenue comparison charts
3. Customer distribution views
4. Migration ROI calculator
5. Automated recommendations

**Success Criteria**:
- Merchants check analytics weekly
- 70% follow migration recommendations
- Revenue leakage reduced by 50%

---

## 9. Edge Cases & Error Handling

### 9.1 Versioning Edge Cases

**Case**: User tries to create duplicate version
```
Solution: Check for identical configuration before versioning
If no actual changes: Show message "No changes detected"
```

**Case**: Version number overflow (>999 versions)
```
Solution: Implement version archival after 12 months of zero subscriptions
Archive versions can be viewed but not activated
```

**Case**: Circular parent references
```
Solution: Database constraint prevents self-referencing
Validation logic prevents circular chains
```

### 9.2 Migration Failure Scenarios

**Case**: Stripe API failure during migration
```
Recovery:
1. Retry with exponential backoff (3 attempts)
2. If fails, mark subscription for manual review
3. Continue with remaining subscriptions
4. Send alert to admin dashboard
```

**Case**: Customer's payment method fails during migration
```
Recovery:
1. Keep subscription on old version
2. Mark as "migration_pending"
3. Retry after payment method updated
4. Notify merchant of pending migrations
```

**Case**: Partial migration success (50/100 succeed)
```
Recovery:
1. Complete successful migrations
2. Log failed migrations with reasons
3. Provide "Retry Failed" button
4. Generate report for merchant
```

### 9.3 Data Consistency Issues

**Case**: Database update succeeds but Stripe sync fails
```
Recovery:
1. Mark product with sync_status = 'pending'
2. Background job retries sync
3. Alert if sync fails after 24 hours
4. Provide manual sync button
```

---

## 10. Performance Considerations

### 10.1 Query Optimization

**Problem**: Fetching all versions of a product with subscription counts

**Current** (N+1 queries):
```sql
SELECT * FROM products WHERE name = 'Pro Plan';
-- Then for each version:
SELECT COUNT(*) FROM subscriptions WHERE product_id = ?;
```

**Optimized** (Single query):
```sql
SELECT
  p.*,
  COUNT(s.id) as subscription_count,
  SUM(s.amount) as total_revenue
FROM products p
LEFT JOIN subscriptions s ON s.product_id = p.id
WHERE p.organization_id = ? AND p.name = ?
GROUP BY p.id
ORDER BY p.version DESC;
```

### 10.2 Database Indexes

```sql
-- Version lookup optimization
CREATE INDEX idx_products_org_name_version
  ON products(organization_id, name, version);

-- Latest version lookup
CREATE INDEX idx_products_latest_version
  ON products(latest_version_id)
  WHERE latest_version_id IS NOT NULL;

-- Migration queue processing
CREATE INDEX idx_migrations_status_created
  ON product_migrations(status, created_at)
  WHERE status = 'pending';
```

### 10.3 Caching Strategy

**Cache Layers**:
1. **Application Cache** (Redis):
   - Product version counts (TTL: 5 minutes)
   - Version analytics (TTL: 1 hour)
   - Migration preview calculations (TTL: 10 minutes)

2. **Database Cache** (Materialized Views):
   - product_version_analytics (refresh daily)
   - revenue_by_version (refresh hourly)

3. **CDN Cache** (CloudFlare):
   - Product public pages (TTL: 1 hour)
   - Analytics dashboards (TTL: 5 minutes)

**Cache Invalidation**:
- On product update → Invalidate product cache
- On subscription change → Invalidate analytics cache
- On migration complete → Invalidate all related caches

---

## 11. Security Considerations

### 11.1 Authorization

- Version creation requires same permissions as product edit
- Migration requires elevated permissions (admin role)
- Analytics visible to all organization members
- Customer data in migrations encrypted at rest

### 11.2 Audit Trail

```sql
CREATE TABLE product_version_audit (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL,
  action VARCHAR(50), -- 'version_created', 'migration_started'
  user_id UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 11.3 Rate Limiting

- Product updates: 10 per minute per organization
- Migration API: 5 per hour per organization
- Analytics API: 100 per minute per organization

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Version detection algorithm
- Change analysis logic
- Migration calculations
- Proration formulas

### 12.2 Integration Tests

- Product update with versioning flow
- Stripe sync with version metadata
- Migration queue processing
- Analytics aggregation

### 12.3 E2E Tests

- Merchant creates version through UI
- Warning modal displays correctly
- Migration wizard completes successfully
- Analytics dashboard loads with correct data

### 12.4 Load Tests

- 1000 concurrent product updates
- Migration of 10,000 subscriptions
- Analytics with 100 product versions

---

## 13. Rollback Plan

If versioning causes critical issues:

1. **Database Rollback**:
   ```sql
   -- Remove version columns (data preserved)
   ALTER TABLE products
     DROP COLUMN version CASCADE,
     DROP COLUMN parent_product_id CASCADE;
   ```

2. **Code Rollback**:
   - Deploy previous version without versioning logic
   - Stripe products remain tagged with metadata (harmless)

3. **Migration Rollback**:
   - Cancel pending migrations
   - Subscriptions remain on current products
   - No customer impact

---

## 14. Success Metrics

### Phase 1 Metrics (Versioning)
- Zero accidental price changes: **Target: 100%**
- Merchant understanding of versioning: **Target: >80%**
- System uptime during rollout: **Target: >99.9%**

### Phase 2 Metrics (Migration)
- Merchants using migration tools: **Target: >50%**
- Successful migration rate: **Target: >90%**
- Average migration time: **Target: <5 minutes**

### Phase 3 Metrics (Analytics)
- Weekly analytics usage: **Target: >70% merchants**
- Revenue recovery from migrations: **Target: >60%**
- Version consolidation rate: **Target: 30% reduction in versions**

---

## 15. Documentation Updates

### Developer Documentation
- API reference for new endpoints
- Migration guide for database changes
- Webhook handling for migrations

### Merchant Documentation
- "Understanding Product Versions" guide
- "How to Migrate Customers" tutorial
- "Best Practices for Pricing Changes"

### Customer Documentation
- "Why is my price different?" FAQ
- "How to upgrade to latest version"
- "Understanding grandfathered pricing"

---

## Conclusion

This system design provides a comprehensive approach to implementing product versioning in BillingOS. The phased approach allows for incremental delivery while maintaining system stability. The focus on protecting existing customers while providing migration tools balances customer trust with revenue optimization.

**Next Steps**:
1. Review and approve design
2. Create detailed sprint tickets
3. Begin Phase 1 implementation
4. Establish monitoring and metrics

**Estimated Total Timeline**: 7-10 weeks for all three phases

---

**Document Version**: 1.0
**Last Updated**: February 2, 2026
**Approved By**: [Pending]