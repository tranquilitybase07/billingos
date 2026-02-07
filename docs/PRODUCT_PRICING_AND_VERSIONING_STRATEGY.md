# Product Pricing & Versioning Strategy for BillingOS

**Document Purpose**: Strategic decision-making guide for handling product price updates and feature limit changes
**Date**: February 2, 2026
**Status**: Awaiting executive decision
**Audience**: CEO, Product Team, Engineering Team

---

## Executive Summary

### The Two Critical Questions

1. **Price Updates**: When a merchant increases a product price (e.g., $10/mo → $15/mo), should existing customers:
   - Stay grandfathered at $10/mo (customer-friendly)
   - Auto-update to $15/mo at renewal (revenue-focused)
   - Merchant decides per change (flexible but complex)

2. **Feature Limit Changes**: When a merchant reduces feature limits (e.g., 2000 API calls → 1000), should the system:
   - Block the operation (safest but inflexible)
   - Auto-version the product so existing customers keep 2000 (recommended)
   - Apply to all customers immediately (risky)

### Why This Matters

- **Customer Trust**: Unexpected price/limit changes drive churn
- **Revenue Impact**: Grandfathering means v1 customers may pay $5/mo less than v4 customers indefinitely
- **Operational Complexity**: Multiple product versions create analytics, support, and database challenges
- **Competitive Positioning**: Industry standard is grandfathering (builds trust)

### Current Status

**What BillingOS Does Today:**
- ✅ Price immutability (following Stripe best practices)
- ✅ Archive old prices, create new ones
- ✅ New subscriptions use new prices
- ❌ **Gap**: No explicit policy for existing customers
- ❌ **Gap**: No product versioning system
- ❌ **Gap**: Unclear feature limit change behavior

---

## 1. Current BillingOS Implementation

### Architecture Overview

**Database Schema:**
```
products
├── id, organization_id, name
├── stripe_product_id
└── is_archived

product_prices (many per product)
├── product_id
├── amount_type, price_amount, price_currency
├── recurring_interval, recurring_interval_count
├── stripe_price_id
└── is_archived

product_features (many-to-many junction)
├── product_id, feature_id
├── display_order
├── config (JSONB) ← Per-product overrides like limits
└── stripe_product_feature_id
```

**Current Update Flow:**
1. Merchant edits product via `PATCH /products/:id`
2. Basic fields (name, description) update in-place
3. For price changes:
   - Old prices archived (`is_archived = true`, Stripe `active = false`)
   - New prices created (new Stripe price IDs)
4. For feature changes:
   - Features can be linked/unlinked
   - Config (including limits) can be updated
5. ⚠️ **Problem**: No documentation on whether changes affect existing subscriptions

### What Works Well

- **Stripe Best Practice Compliance**: Price amounts are immutable after creation
- **Clean Separation**: Prices and features are separate entities
- **Atomic Operations**: Product updates are transactional (all-or-nothing)
- **Stripe Sync**: Changes propagate to Stripe Connect accounts

### Critical Gaps

1. **No Grandfathering Policy**: Unclear if existing subscriptions get new prices
2. **No Version Management**: All customers see latest product configuration
3. **No Migration Tools**: Can't bulk-move customers to new pricing
4. **No Limit Change Validation**: System allows reducing limits without warnings
5. **No Analytics**: Can't see revenue impact of price changes across cohorts

---

## 2. Competitor Analysis

### Flowglad's Approach

**Architecture**: Pricing Model System

**Code References:**
- `/Users/ankushkumar/Code/flowglad/platform/flowglad-next/src/utils/pricingModel.ts` (lines 284-401)
- `/Users/ankushkumar/Code/flowglad/platform/flowglad-next/src/db/tableMethods/priceMethods.ts` (lines 716-731)

**How It Works:**

1. **Pricing Models**: Collections of products/prices/features
2. **Price Immutability**: Enforced at database level via `createOnlyColumns`
   ```typescript
   const createOnlyColumns = {
     unitPrice: true,  // CANNOT BE CHANGED
     intervalUnit: true,
     intervalCount: true,
     // ... other immutable fields
   }
   ```
3. **Update Strategy**:
   - Create NEW pricing model for price changes
   - Set new model as default
   - New customers → New pricing model
   - Existing customers → Stay on old pricing model (grandfathered)

4. **Migration**:
   - **Method**: Destructive migration API
   - **Behavior**: Cancels ALL subscriptions, creates new ones
   - **Warning**: "⚠️ This operation cannot be undone"
   - **Use Case**: One-time migrations, not ongoing management

**Pros:**
- ✅ Strong immutability guarantees
- ✅ Clean separation between old/new pricing
- ✅ Existing customers fully protected

**Cons:**
- ❌ Destructive migrations are risky
- ❌ Pricing Models add conceptual complexity
- ❌ No gradual migration tooling

---

### Autumn's Approach

**Architecture**: Product Versioning System

**Code References:**
- `/Users/ankushkumar/Code/autumn/server/src/internal/products/handlers/productActions/updateProduct.ts` (lines 118-145)
- `/Users/ankushkumar/Code/autumn/server/src/internal/products/handlers/handleVersionProduct.ts` (lines 44-80)
- `/Users/ankushkumar/Code/autumn/server/src/internal/products/handlers/handleMigrateProductV2.ts`

**How It Works:**

1. **Version Field**: Each product has `version: number` (1, 2, 3...)
2. **Auto-Versioning Logic**:
   ```typescript
   const cusProductExists = cusProductsCurVersion.length > 0;

   if (cusProductExists && (priceChanged || featuresChanged)) {
     if (!productSame) {
       // Auto-create new version
       await handleVersionProductV2({
         newProductV2,
         latestProduct,
         org, env
       });
     }
   }
   ```
3. **Update Strategy**:
   - If NO customers exist → Update in-place
   - If customers exist AND material changes → Auto-version
   - Material changes = price, features, limits, trial periods
   - Non-material = name, description (update in-place, sync to Stripe)

4. **Migration**:
   - **Method**: Async bulk migration API
   - **Endpoint**: `POST /v1/products/migrate`
   - **Validation**:
     - Cannot migrate free ↔ paid
     - Prepaid features must exist in both versions
   - **Proration**: Calculates prorated charges/credits automatically

**Pros:**
- ✅ Automatic protection for existing customers
- ✅ Non-destructive migration tools
- ✅ Proration built-in
- ✅ Clear version history (v1, v2, v3)

**Cons:**
- ❌ Version sprawl problem (v1: 100 users, v2: 1000 users, etc.)
- ❌ Analytics complexity (must aggregate across versions)
- ❌ No automatic sunset policies

---

### Side-by-Side Comparison

| Feature | BillingOS (Current) | Flowglad | Autumn |
|---------|---------------------|----------|--------|
| **Price Immutability** | ✅ Archive + Create new | ✅ Enforced at DB level | ✅ Archive + Create new |
| **Grandfathering** | ❌ Unclear | ✅ Via Pricing Models | ✅ Via Product Versions |
| **Auto-Protection** | ❌ None | ✅ Must create new model | ✅ Auto-version if customers exist |
| **Migration Tools** | ❌ None | ⚠️ Destructive only | ✅ Non-destructive API |
| **Proration** | ⚠️ Manual via Stripe | ❌ N/A (destructive) | ✅ Automatic calculation |
| **Version Tracking** | ❌ None | ⚠️ Pricing Model concept | ✅ Explicit version numbers |
| **Analytics** | ❌ No version breakdown | ⚠️ Manual | ⚠️ Manual |
| **Limit Changes** | ⚠️ Allowed, unclear impact | ✅ Requires new model | ✅ Auto-versions |
| **Complexity** | Low | Medium-High | Medium |

---

## 3. Stripe Official Recommendations

### Price Management Best Practices

**Source**: https://docs.stripe.com/products-prices/manage-prices

**Core Rules:**
1. ❌ **Cannot edit price amounts** after creation
2. ✅ **Can only update**: `metadata`, `nickname`, `active`, `lookup_key`
3. 📋 **Recommended pattern**:
   - Create new price with new amount
   - Switch subscriptions to new price ID
   - Mark old price as `active: false`

**Quote from Stripe Docs:**
> "You cannot change a price's amount in the API. To change pricing, create a new price for the new amount, switch to the new price's ID, then update the old price to be inactive."

### Subscription Change Patterns

**Source**: https://docs.stripe.com/billing/subscriptions/change

**Change Timing Options:**
1. **Immediate with proration**: Charge/credit difference now
2. **At renewal**: New price starts next billing cycle
3. **Pending updates**: Only apply if payment succeeds

**Stripe Recommendation:**
- Preview proration before applying changes
- Use customer portal for self-service changes
- Don't cancel and recreate subscriptions (modify existing ones)

### Key Takeaways

1. **Price immutability is non-negotiable** (BillingOS already follows this ✅)
2. **Subscription modifications are preferred** over cancel/recreate
3. **Proration is built-in** and should be leveraged
4. **Customer choice is valued** (portal for self-service)

---

## 4. The Version Sprawl Problem

### Real-World Scenario

**Merchant**: SaaS company offering "Pro Plan"
**Timeline**: Updates pricing every 6 months due to market conditions

```
Timeline of Price Changes:
├── Jan 2025: Launch at $10/mo with 1000 API calls
│   └── Customers: 100 users on v1
│
├── Jul 2025: Market research → increase to $12/mo, 1500 API calls
│   └── Customers: 100 on v1 + 1000 on v2
│
├── Jan 2026: Feature expansion → increase to $15/mo, 2000 API calls
│   └── Customers: 100 on v1 + 1000 on v2 + 600 on v3
│
└── Jul 2026: Competitor pressure → increase to $18/mo, 2500 API calls
    └── Customers: 100 on v1 + 1000 on v2 + 600 on v3 + 300 on v4
```

**Current State After 18 Months:**
- 4 product versions in production
- 2,000 total customers across versions
- $10/mo price gap between v1 and v4

### Operational Challenges

**1. Revenue Leakage**
```
Monthly Revenue Loss from Grandfathering:
- v1 (100 users): $10/mo × 100 = $1,000 (losing $8/mo per user = -$800)
- v2 (1000 users): $12/mo × 1000 = $12,000 (losing $6/mo per user = -$6,000)
- v3 (600 users): $15/mo × 600 = $9,000 (losing $3/mo per user = -$1,800)
- v4 (300 users): $18/mo × 300 = $5,400 (current rate)

Total MRR: $27,400
Potential MRR if all at v4: $36,000
Revenue leakage: $8,600/mo = $103,200/year
```

**2. Database Complexity**
```sql
-- Query to get all "Pro Plan" prices becomes complex
SELECT * FROM product_prices
WHERE product_id IN (
  'pro-v1', 'pro-v2', 'pro-v3', 'pro-v4'
) AND is_archived = false;

-- Analytics queries must aggregate across versions
SELECT
  product_id,
  SUM(subscription_count) as total_subs,
  SUM(monthly_revenue) as total_mrr
FROM subscriptions
WHERE product_id LIKE 'pro-v%'
GROUP BY product_id;
```

**3. Support Complexity**
- Support agent: "What's your API limit?"
- Customer: "I have 1000" (on v1)
- Website shows: "2500 API calls" (v4)
- Confusion and potential complaints

**4. Migration Management Burden**
- Which cohort to migrate first?
- How to communicate changes?
- What incentives to offer?
- How to minimize churn?

---

## 5. Critical Business Questions to Answer

### A. Pricing Policy (High Priority)

**Question 1**: When a merchant updates a product price, what happens to existing customers?

**Options:**
- **Option A: Grandfathered** (stay at current price forever)
  - 👍 Builds trust, industry standard
  - 👎 Revenue leakage over time
  - Example: Stripe, GitHub, Notion

- **Option B: Auto-update at renewal** (new price at next billing cycle)
  - 👍 Faster revenue recovery
  - 👎 May increase churn, requires notification system
  - Example: Netflix, Spotify

- **Option C: Immediate with proration**
  - 👍 Maximum revenue recovery
  - 👎 Highest churn risk, customer complaints
  - Example: AWS (for usage changes)

**Recommendation**: **Option A (Grandfathered)** for BillingOS because:
- BillingOS is a B2B SaaS tool (trust is critical)
- Merchants expect control (they choose when to migrate)
- Competitive positioning (Autumn, Flowglad, Polar all grandfather)

---

### B. Feature Limit Policy (High Priority)

**Question 2**: Should merchants be allowed to reduce feature limits on existing products?

**Options:**
- **Option A: Yes, with auto-versioning** (existing customers keep old limits)
  - 👍 Safe for customers, flexible for merchants
  - 👎 Creates version sprawl
  - Used by: Autumn

- **Option B: No, block the operation**
  - 👍 Prevents accidents, simplest
  - 👎 Inflexible, merchants must create new product
  - Used by: Flowglad (requires new pricing model)

- **Option C: Yes, applies to all customers**
  - 👍 Simplest implementation
  - 👎 Dangerous (could break customer workflows)
  - Used by: None (too risky)

**Recommendation**: **Option A (Auto-versioning)** because:
- Protects existing customers from breaking changes
- Gives merchants flexibility to adjust positioning
- Aligns with versioning approach for prices

---

### C. Versioning Strategy (High Priority)

**Question 3**: How should BillingOS implement product versioning?

**Options:**
- **Option A: Auto-version like Autumn** (v1, v2, v3...)
  - 👍 Automatic protection, clear history
  - 👎 Version sprawl problem, analytics complexity

- **Option B: Pricing Models like Flowglad**
  - 👍 Clean conceptual separation
  - 👎 More abstract, migration is destructive

- **Option C: Price archival only** (current approach)
  - 👍 Simplest, already implemented
  - 👎 No protection for existing customers

**Recommendation**: **Option A (Auto-versioning)** because:
- Clearer than Pricing Models abstraction
- Explicit version numbers are easy to understand
- Can add migration tools incrementally

---

### D. Version Sprawl Management (Medium Priority)

**Question 4**: How should BillingOS help merchants manage many product versions over time?

**Options:**
- **Option A: Manual migration tools**
  - Merchant-controlled bulk migration UI/API
  - Can notify customers, offer incentives
  - Gradual migration reduces churn

- **Option B: Automatic sunset policy**
  - After X months, auto-migrate old versions
  - Reduces sprawl automatically
  - Less merchant control

- **Option C: Analytics + suggestions**
  - Show version revenue breakdown
  - Suggest migrations when v1 has <5% of revenue
  - Merchant decides

**Recommendation**: **Combination of A + C**:
- Phase 1: Manual migration tools (merchant control)
- Phase 2: Analytics to guide decisions (data-driven)
- Phase 3: Optional auto-sunset (merchant opt-in)

---

### E. Migration Billing (Medium Priority)

**Question 5**: When migrating customers to a higher price, when does the increase take effect?

**Options:**
- **Option A: Immediate with proration** (charge now)
- **Option B: At next renewal** (wait for billing cycle)
- **Option C: Grace period** (1-2 cycles notice)

**Recommendation**: **Option B (At next renewal)** because:
- Industry standard approach
- Gives customers advance notice
- Reduces complaints and chargebacks
- Merchants can override for urgent changes

---

### F. Analytics Requirements (Low Priority - Can Build Later)

**Question 6**: What version analytics should BillingOS provide?

**Recommended Features:**
- Revenue by version (MRR/ARR breakdown)
- Customer count per version
- New signup trends (which version are new customers choosing?)
- Revenue leakage calculation (what if all were on latest version?)
- Churn rate by version (are v1 customers churning more?)

**Priority**: Phase 2 (after versioning is implemented)

---

## 6. Recommended Technical Approach

### Phase 1: Implement Product Versioning (MVP)

**Goal**: Protect existing customers from price/limit changes

**Database Schema Changes:**

```sql
-- Add version field to products table
ALTER TABLE products
ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Add composite unique constraint
ALTER TABLE products
ADD CONSTRAINT products_org_name_version_unique
UNIQUE (organization_id, name, version);

-- Add versioning metadata
ALTER TABLE products
ADD COLUMN parent_product_id UUID REFERENCES products(id),
ADD COLUMN version_created_reason TEXT,
ADD COLUMN version_created_at TIMESTAMPTZ DEFAULT NOW();
```

**Auto-Versioning Logic:**

```typescript
// In products.service.ts
async updateProduct(id: string, dto: UpdateProductDto) {
  const existingProduct = await this.getProduct(id);

  // Check if customers exist on this product
  const subscriptionCount = await this.getSubscriptionCount(id);
  const hasCustomers = subscriptionCount > 0;

  // Detect material changes
  const hasPriceChanges = dto.prices?.create || dto.prices?.archive;
  const hasFeatureLimitReductions = this.detectLimitReductions(
    existingProduct.features,
    dto.features
  );

  // If customers exist AND material changes → VERSION
  if (hasCustomers && (hasPriceChanges || hasFeatureLimitReductions)) {
    return this.createProductVersion(existingProduct, dto);
  }

  // Otherwise, update in-place
  return this.updateProductInPlace(id, dto);
}

private async createProductVersion(
  existingProduct: Product,
  changes: UpdateProductDto
) {
  const newVersion = existingProduct.version + 1;

  // Create new product with incremented version
  const newProduct = await this.createProduct({
    ...existingProduct,
    ...changes,
    version: newVersion,
    parent_product_id: existingProduct.id,
    version_created_reason: 'Auto-versioned due to price/limit changes',
  });

  // Mark old version as "superseded"
  await this.markProductSuperseded(existingProduct.id, newProduct.id);

  return newProduct;
}
```

**Frontend Changes:**

1. **Product Edit Warning Modal**:
   ```tsx
   // When edit would trigger versioning
   <AlertDialog>
     <AlertDialogTitle>This will create a new product version</AlertDialogTitle>
     <AlertDialogDescription>
       You're changing prices or reducing feature limits on a product
       with {subscriptionCount} active customers.

       - Existing customers will stay on v{currentVersion} (protected)
       - New customers will get v{newVersion} with your changes
       - You can migrate customers later using the Migration tool
     </AlertDialogDescription>
     <AlertDialogAction>Create v{newVersion}</AlertDialogAction>
   </AlertDialog>
   ```

2. **Version Indicator**:
   ```tsx
   // In product list/detail pages
   <Badge variant="outline">v{product.version}</Badge>
   {product.superseded_by && (
     <Alert>
       This is an old version.
       <Link to={`/products/${product.superseded_by}`}>
         View latest (v{latestVersion})
       </Link>
     </Alert>
   )}
   ```

**API Changes:**

```typescript
// New endpoints
GET /products                     // List products (default: latest versions only)
GET /products?include_all_versions=true  // Include all versions
GET /products/:id/versions        // Get all versions of a product
GET /products/:id/subscriptions/count    // Check if versioning needed (already exists ✅)

// Enhanced existing endpoint
PATCH /products/:id               // Returns warning if versioning will occur
{
  // Response when versioning:
  {
    "will_version": true,
    "current_version": 1,
    "new_version": 2,
    "affected_subscriptions": 450,
    "reason": "Price increase and feature limit reduction detected"
  }
}
```

**Stripe Sync Strategy:**

- Each product version gets its own Stripe Product
- Stripe Product name includes version: `"Pro Plan (v2)"`
- Use Stripe metadata: `{ "billingos_version": "2", "billingos_parent": "prod_xyz" }`
- New prices always created (already implemented ✅)

---

### Phase 2: Migration Tools (Post-MVP)

**Goal**: Help merchants manage version sprawl

**Features to Build:**

1. **Bulk Migration API**
   ```typescript
   POST /products/:id/migrate
   {
     "from_version": 1,
     "to_version": 2,
     "customer_ids": ["cus_1", "cus_2", ...],  // Optional filter
     "effective_date": "immediate" | "next_renewal",
     "notification": {
       "send_email": true,
       "email_template_id": "price_increase_v2"
     },
     "incentive": {
       "type": "discount",
       "percent_off": 20,
       "duration_months": 2
     }
   }
   ```

2. **Migration Preview**
   ```typescript
   POST /products/:id/migrate/preview
   // Returns:
   {
     "affected_customers": 450,
     "total_revenue_impact": {
       "immediate": 4500.00,  // If immediate
       "monthly": 2250.00     // Ongoing increase
     },
     "proration_details": [
       { "customer_id": "cus_1", "charge": 10.50, ... }
     ],
     "estimated_churn_risk": "medium"  // Based on historical data
   }
   ```

3. **Migration Queue**
   - Async job processing (BullMQ)
   - Batch updates to Stripe
   - Rollback on failures
   - Progress tracking UI

---

### Phase 3: Analytics Dashboard (Post-MVP)

**Goal**: Data-driven version management

**Features to Build:**

1. **Version Overview**
   ```
   Product: Pro Plan
   ├── v1 (100 customers, $1,000 MRR) ← 🟡 Consider migrating
   ├── v2 (1000 customers, $12,000 MRR)
   ├── v3 (600 customers, $9,000 MRR)
   └── v4 (300 customers, $5,400 MRR) ← ✅ Latest

   Total: 2,000 customers, $27,400 MRR
   Potential if all v4: $36,000 MRR (+31.4%)
   ```

2. **Migration ROI Calculator**
   - Estimate revenue impact of migrating cohort X → version Y
   - Factor in expected churn (e.g., 5-10% for price increases)
   - Show break-even timeline

3. **Churn Analysis**
   - Churn rate by product version
   - Identify if old versions have higher churn
   - Suggest proactive migrations

---

## 7. Implementation Considerations

### Development Effort Estimate

| Phase | Tasks | Effort | Priority |
|-------|-------|--------|----------|
| **Phase 1: Versioning** | | | **P0** |
| - Database schema changes | Migration + rollback scripts | 2 days | |
| - Auto-versioning service logic | Detection + creation | 3 days | |
| - Frontend warning modals | UI components + hooks | 2 days | |
| - API enhancements | Endpoints + validation | 2 days | |
| - Stripe sync updates | Metadata + naming | 1 day | |
| - Testing | Unit + integration + E2E | 3 days | |
| **Phase 1 Total** | | **~2 weeks** | |
| | | | |
| **Phase 2: Migration** | | | **P1** |
| - Migration API | Endpoints + validation | 3 days | |
| - Async job queue | BullMQ setup + handlers | 3 days | |
| - Migration preview | Calculation logic | 2 days | |
| - Frontend migration UI | Dashboard + modals | 4 days | |
| - Email notifications | Templates + triggers | 2 days | |
| - Testing | Unit + integration | 3 days | |
| **Phase 2 Total** | | **~3 weeks** | |
| | | | |
| **Phase 3: Analytics** | | | **P2** |
| - Version analytics API | Aggregation queries | 3 days | |
| - Dashboard UI | Charts + tables | 5 days | |
| - ROI calculator | Revenue modeling | 2 days | |
| - Testing | Unit + integration | 2 days | |
| **Phase 3 Total** | | **~2 weeks** | |

### Risks and Mitigations

**Risk 1: Version Sprawl Gets Out of Control**
- **Mitigation**: Build migration tools in Phase 2 (don't wait)
- **Mitigation**: Show analytics to make version management visible
- **Mitigation**: Add "sunset old version" workflow

**Risk 2: Merchants Don't Understand Versioning Concept**
- **Mitigation**: Clear UI messaging with version badges
- **Mitigation**: Onboarding tooltips explaining versioning
- **Mitigation**: Show customer count per version (makes impact clear)

**Risk 3: Accidental Version Creation**
- **Mitigation**: Warning modal before versioning
- **Mitigation**: Preview changes before confirming
- **Mitigation**: "Undo" feature (merge versions if no new customers on v2)

**Risk 4: Stripe Sync Issues with Many Versions**
- **Mitigation**: Use Stripe metadata to track version relationships
- **Mitigation**: Rate limit checks to avoid API errors
- **Mitigation**: Retry logic with exponential backoff

**Risk 5: Database Performance with Many Versions**
- **Mitigation**: Index on (organization_id, version)
- **Mitigation**: Default queries filter to latest version only
- **Mitigation**: Archive old versions with zero customers

---

## 8. Decision Matrix

### Comparing Approaches

| Criteria | Current (No Versioning) | Flowglad (Pricing Models) | Autumn (Versioning) | **Recommended** |
|----------|------------------------|---------------------------|---------------------|-----------------|
| **Customer Protection** | ❌ None | ✅✅ Strong | ✅✅ Strong | ✅✅ Strong (auto-version) |
| **Merchant Flexibility** | ⚠️ Unclear | ⚠️ Medium | ✅ High | ✅ High |
| **Implementation Complexity** | ✅ Low (done) | ❌ High (new concept) | ⚠️ Medium | ⚠️ Medium |
| **Migration Tools** | ❌ None | ❌ Destructive only | ✅ Non-destructive | ✅ Phase 2 |
| **Version Sprawl Management** | N/A | ⚠️ Manual | ⚠️ Manual | ✅ Analytics + tools (Phase 3) |
| **Stripe Compatibility** | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Analytics** | ⚠️ Basic | ❌ Manual | ⚠️ Basic | ✅ Advanced (Phase 3) |
| **Dev Effort** | ✅ 0 (done) | ❌ 4-6 weeks | ⚠️ 2-3 weeks | ⚠️ 2 weeks (Phase 1) |
| **Competitive Positioning** | ❌ Weak | ✅ Strong | ✅✅ Strongest | ✅✅ Strongest |

### Scoring (1-5, higher is better)

| Approach | Customer Impact | Revenue Management | Dev Effort | Total |
|----------|-----------------|-------------------|------------|-------|
| **Current (No versioning)** | 1 | 1 | 5 | **7/15** |
| **Flowglad (Pricing Models)** | 5 | 3 | 2 | **10/15** |
| **Autumn (Versioning)** | 5 | 4 | 3 | **12/15** |
| **Recommended (Phased)** | 5 | 5 | 4 | **14/15** |

---

## 9. Recommended Decisions

### Immediate Decisions (Before Starting Implementation)

**Decision 1**: Adopt auto-versioning approach (like Autumn)
- ✅ **Rationale**: Best balance of customer protection + merchant flexibility
- ✅ **Evidence**: Used by Autumn, aligns with Stripe best practices
- ✅ **Impact**: Protects existing customers, clear version history

**Decision 2**: Grandfather existing customers on price/limit changes
- ✅ **Rationale**: Industry standard, builds trust, competitive positioning
- ✅ **Evidence**: Stripe, Autumn, Flowglad all do this
- ✅ **Impact**: Revenue leakage acceptable trade-off for customer trust

**Decision 3**: Block limit decreases WITHOUT versioning
- ✅ **Rationale**: Prevents accidental breaking changes to active customers
- ✅ **Evidence**: Autumn auto-versions, Flowglad requires new pricing model
- ✅ **Impact**: Forces merchant to explicitly version product

**Decision 4**: Build in phases (v1 → v2 → v3)
- ✅ **Rationale**: Ship versioning quickly, iterate on migration/analytics
- ✅ **Evidence**: Autumn launched without migration tools initially
- ✅ **Impact**: 2-week MVP vs 7-week full implementation

### Can Decide Later (Don't Block Phase 1)

**Decision 5**: Migration timing policy (immediate vs renewal)
- ⏸️ **Defer to**: Phase 2 (when building migration tools)
- 💡 **Recommendation**: Default to "at renewal", allow merchant override

**Decision 6**: Automatic sunset policies
- ⏸️ **Defer to**: Phase 3 (after seeing real usage patterns)
- 💡 **Recommendation**: Start with manual tools, add automation later

**Decision 7**: Version analytics features
- ⏸️ **Defer to**: Phase 3 (after versioning is stable)
- 💡 **Recommendation**: Start with basic counts, expand based on merchant feedback

---

## 10. Next Steps

### Before Starting Development

1. **CEO/Exec Approval**: Get sign-off on recommended decisions
2. **Product Spec**: Write detailed product spec for Phase 1 (versioning MVP)
3. **Design Review**: Create mockups for warning modals and version UI
4. **Database Planning**: Finalize schema changes and migration scripts

### Phase 1 Implementation Checklist

- [ ] Database migration script (add version field, constraints)
- [ ] Service layer: auto-versioning detection logic
- [ ] Service layer: create product version function
- [ ] API: enhance PATCH /products/:id with versioning
- [ ] API: add GET /products/:id/versions endpoint
- [ ] Frontend: warning modal before versioning
- [ ] Frontend: version badge in product list/detail
- [ ] Frontend: "View latest version" link for superseded products
- [ ] Stripe sync: version in product name and metadata
- [ ] Unit tests: versioning logic (80%+ coverage)
- [ ] Integration tests: full update flow with versioning
- [ ] E2E tests: merchant updates product, sees warning, confirms
- [ ] Documentation: merchant guide on versioning
- [ ] Documentation: API reference updates

### Success Metrics (After Phase 1 Launch)

- **Customer Protection**: Zero complaints about unexpected price changes
- **Merchant Adoption**: >80% of merchants understand versioning (survey)
- **System Stability**: <1% error rate on product updates
- **Performance**: Product update latency <500ms (p95)

### Future Phases

- **Phase 2** (Migration Tools): +3 weeks after Phase 1
- **Phase 3** (Analytics): +2 weeks after Phase 2
- **Total Timeline**: ~7 weeks to full feature parity with Autumn

---

## Appendix: Key Code References

### BillingOS Current Implementation
- Product service: `apps/api/src/products/products.service.ts` (lines 444-763)
- Update DTO: `apps/api/src/products/dto/update-product.dto.ts`
- Stripe service: `apps/api/src/stripe/stripe.service.ts`
- Frontend form: `apps/web/src/hooks/useProductForm.ts`

### Flowglad References
- Pricing model transaction: `/Users/ankushkumar/Code/flowglad/platform/flowglad-next/src/utils/pricingModel.ts` (lines 284-401)
- Price immutability: `/Users/ankushkumar/Code/flowglad/platform/flowglad-next/src/db/schema/prices.ts` (lines 50-63)
- Safe insert price: `/Users/ankushkumar/Code/flowglad/platform/flowglad-next/src/db/tableMethods/priceMethods.ts` (lines 716-731)

### Autumn References
- Update product logic: `/Users/ankushkumar/Code/autumn/server/src/internal/products/handlers/productActions/updateProduct.ts` (lines 118-145)
- Version handler: `/Users/ankushkumar/Code/autumn/server/src/internal/products/handlers/handleVersionProduct.ts` (lines 44-80)
- Migration handler: `/Users/ankushkumar/Code/autumn/server/src/internal/products/handlers/handleMigrateProductV2.ts`
- Proration tests: `/Users/ankushkumar/Code/autumn/server/tests/integration/billing/update-subscription/version-update/version-pricing.test.ts`

### Stripe Documentation
- Manage prices: https://docs.stripe.com/products-prices/manage-prices
- Subscription changes: https://docs.stripe.com/billing/subscriptions/change
- Pricing models: https://docs.stripe.com/products-prices/pricing-models

---

**Document End** | Questions? Contact: Engineering Team | Last Updated: February 2, 2026
