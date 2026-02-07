# Feature Changes and Product Versioning

**Purpose**: Detailed guide on how feature changes interact with the product versioning system
**Date**: February 2, 2026
**Related**: SYSTEM_DESIGN.md

---

## Overview

This document explains how BillingOS handles feature changes within the product versioning system. Features are a critical part of product offerings, and changes to them can significantly impact existing customers.

---

## 1. Understanding the Feature System

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     features table                          │
│        Base feature definitions (organization-wide)         │
│  ┌────────────────────────────────────────────────────┐    │
│  │ name: "api_calls_limit"                            │    │
│  │ type: "usage_quota"                                │    │
│  │ properties: { limit: 1000, period: "month" }       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 product_features table                       │
│           Product-specific overrides (per tier)             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ product_id: "starter_plan"                         │    │
│  │ feature_id: "api_calls_limit"                      │    │
│  │ config: { limit: 1000 }  // Uses base             │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ product_id: "pro_plan"                             │    │
│  │ feature_id: "api_calls_limit"                      │    │
│  │ config: { limit: 5000 }  // Overrides to 5000     │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  feature_grants table                        │
│         Snapshot at subscription creation (frozen)          │
│  ┌────────────────────────────────────────────────────┐    │
│  │ customer_id: "cust_123"                            │    │
│  │ subscription_id: "sub_456"                         │    │
│  │ feature_id: "api_calls_limit"                      │    │
│  │ properties: { limit: 5000, period: "month" }       │    │
│  │ // Merged snapshot, protected from changes         │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

1. **Base Configuration** (`features.properties`): Default values for all products
2. **Product Override** (`product_features.config`): Product-specific customization
3. **Customer Snapshot** (`feature_grants.properties`): Frozen at subscription time

---

## 2. Feature Change Scenarios

### Safe Changes (No Versioning Required)

These changes benefit customers and don't require product versioning:

#### 2.1 Adding Features

**Example**: Adding "premium_support" to Pro Plan

```typescript
// UpdateProductDto
{
  features: {
    link: [{
      feature_id: "premium_support_feature_id",
      display_order: 4,
      config: {}
    }]
  }
}
```

**Result**:
- ✅ New subscriptions get the feature
- ✅ Existing subscriptions unaffected (can be granted separately if desired)
- ✅ No versioning triggered

#### 2.2 Increasing Limits

**Example**: API calls from 1000 → 2000

```typescript
// UpdateProductDto
{
  features: {
    update: [{
      feature_id: "api_calls_feature_id",
      config: { limit: 2000 }  // Increased from 1000
    }]
  }
}
```

**Result**:
- ✅ New subscriptions get higher limit
- ✅ Existing subscriptions keep their snapshot (1000)
- ✅ No versioning triggered
- 💡 Consider notifying existing customers about manual upgrade option

#### 2.3 Reordering Features

**Example**: Changing display_order

```typescript
{
  features: {
    update: [
      { feature_id: "feature_1", display_order: 2 },  // Was 1
      { feature_id: "feature_2", display_order: 1 }   // Was 2
    ]
  }
}
```

**Result**:
- ✅ UI presentation changes
- ✅ No functional impact
- ✅ No versioning triggered

---

### Breaking Changes (Versioning Required)

These changes negatively impact customers and MUST trigger versioning:

#### 2.4 Removing Features

**Example**: Removing "advanced_analytics" from Starter Plan

```typescript
// UpdateProductDto
{
  features: {
    unlink: ["advanced_analytics_feature_id"]
  }
}
```

**Warning Modal**:
```
⚠️ This will create Version 2 because:
• Feature "Advanced Analytics" removed

Impact:
• 450 existing customers stay on v1 (keep analytics)
• New customers get v2 (no analytics)
```

**Result**:
- 🔒 Creates product v2
- 🔒 Existing customers protected on v1
- 🔒 New customers get v2 without the feature

#### 2.5 Decreasing Limits

**Example**: API calls from 2000 → 1000

```typescript
// UpdateProductDto
{
  features: {
    update: [{
      feature_id: "api_calls_feature_id",
      config: { limit: 1000 }  // Decreased from 2000
    }]
  }
}
```

**Warning Modal**:
```
⚠️ This will create Version 2 because:
• API calls reduced from 2000 to 1000 (-50%)

Impact:
• 450 existing customers stay on v1 (2000 calls)
• New customers get v2 (1000 calls)
• Monthly revenue impact: -$2,250 until migration
```

**Result**:
- 🔒 Creates product v2
- 🔒 Existing customers protected with 2000 calls
- 🔒 New customers get 1000 calls

#### 2.6 Changing Feature Type

**Example**: Changing from "numeric_limit" to "usage_quota"

```typescript
// This is a fundamental change that affects how the feature works
// OLD: numeric_limit (10 projects total)
// NEW: usage_quota (10 projects per month)
```

**Result**:
- 🔒 Always triggers versioning
- 🔒 Changes SDK behavior
- 🔒 May break customer integrations

---

## 3. Implementation Details

### 3.1 Detection Algorithm

```typescript
// In products.service.ts
async function detectFeatureChanges(
  productId: string,
  updateDto: UpdateProductDto
): Promise<VersioningDecision> {

  const triggers: VersioningTrigger[] = [];

  // 1. Check feature removals
  if (updateDto.features?.unlink && updateDto.features.unlink.length > 0) {
    const featureNames = await getFeatureNames(updateDto.features.unlink);
    triggers.push({
      type: 'feature_removal',
      severity: 'breaking',
      description: `Removing features: ${featureNames.join(', ')}`
    });
  }

  // 2. Check feature limit changes
  if (updateDto.features?.update) {
    for (const update of updateDto.features.update) {
      const current = await getProductFeature(productId, update.feature_id);

      // Handle different feature types
      const comparison = compareFeatureConfigs(
        current.feature.type,
        current.config,
        update.config
      );

      if (comparison.isBreaking) {
        triggers.push({
          type: 'feature_limit_reduction',
          severity: 'breaking',
          description: comparison.description
        });
      }
    }
  }

  // 3. Check feature additions (safe, but track for UI)
  if (updateDto.features?.link && updateDto.features.link.length > 0) {
    // This is safe, no versioning needed
    // But we track it for the UI to show what's changing
  }

  return {
    requiresVersioning: triggers.some(t => t.severity === 'breaking'),
    triggers,
    suggestedVersionReason: triggers.map(t => t.description).join(', ')
  };
}

function compareFeatureConfigs(
  featureType: string,
  currentConfig: any,
  newConfig: any
): ComparisonResult {

  // Extract the relevant limit based on feature type
  const currentLimit = extractLimit(featureType, currentConfig);
  const newLimit = extractLimit(featureType, newConfig);

  // Handle null/undefined cases
  if (currentLimit === null || newLimit === null) {
    return { isBreaking: false };
  }

  // Compare limits
  if (newLimit < currentLimit) {
    return {
      isBreaking: true,
      description: `Limit reduced from ${currentLimit} to ${newLimit}`
    };
  }

  // Check for other breaking changes (custom fields)
  // This could be extended for specific feature types

  return { isBreaking: false };
}

function extractLimit(featureType: string, config: any): number | null {
  if (!config) return null;

  switch (featureType) {
    case 'usage_quota':
    case 'numeric_limit':
      return config.limit || null;

    case 'boolean_flag':
      return null;  // No limits for boolean features

    default:
      // Try common field names
      return config.limit || config.value || config.quantity || null;
  }
}
```

### 3.2 UI Warning Modal

The warning modal should clearly explain feature changes:

```typescript
// Frontend component
function VersionWarningModal({ changes }) {
  const featureChanges = changes.filter(c =>
    c.type === 'feature_removal' ||
    c.type === 'feature_limit_reduction'
  );

  return (
    <Modal>
      <h2>⚠️ Version Warning</h2>

      <p>Your changes will create a new product version because:</p>

      <ul>
        {changes.map(change => (
          <li key={change.id}>
            {change.type === 'feature_removal' &&
              `Feature "${change.featureName}" removed`
            }
            {change.type === 'feature_limit_reduction' &&
              `${change.featureName}: ${change.oldLimit} → ${change.newLimit} (-${change.percentChange}%)`
            }
          </li>
        ))}
      </ul>

      <Alert>
        <strong>Impact:</strong>
        <ul>
          <li>{subscriptionCount} existing customers will stay on v{currentVersion}</li>
          <li>New customers will get v{newVersion} with reduced features</li>
        </ul>
      </Alert>

      <ButtonGroup>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>
          Create Version {newVersion}
        </Button>
      </ButtonGroup>
    </Modal>
  );
}
```

---

## 4. Edge Cases and Special Considerations

### 4.1 Null/Undefined Limits

**Scenario**: Feature config.limit is removed (set to null)

```typescript
// Before
config: { limit: 1000 }

// After
config: { }  // or config: { limit: null }
```

**Handling**:
- If null → value: Feature gains a limit (potentially breaking)
- If value → null: Feature becomes unlimited (safe, it's an increase)
- If null → null: No change (safe)

### 4.2 Custom Config Fields

Features might have custom configuration beyond just 'limit':

```typescript
config: {
  limit: 1000,
  rate_limit_window: 60,  // seconds
  burst_capacity: 100,
  overage_allowed: true
}
```

**Handling**:
- Track ALL field changes
- Apply same logic: increases are safe, decreases are breaking
- Show specific changes in warning modal

### 4.3 Base Feature Updates

When updating `features.properties` (affects all products without overrides):

```typescript
// Warning when updating base feature
if (affectedProducts.length > 0) {
  showWarning(`
    This feature is used by ${affectedProducts.length} products.
    Products with overrides: ${withOverrides.length} (unaffected)
    Products without overrides: ${withoutOverrides.length} (will be affected)

    Consider creating overrides for products that shouldn't change.
  `);
}
```

### 4.4 Feature Dependencies

Some features might depend on others:

```typescript
// Example: "advanced_analytics" requires "basic_analytics"
if (removing.includes('basic_analytics') &&
    currentFeatures.includes('advanced_analytics')) {
  showError('Cannot remove basic_analytics while advanced_analytics is enabled');
}
```

---

## 5. Migration Considerations

### 5.1 Migrating Feature Changes

When migrating customers from v1 to v2 with feature differences:

```typescript
// Migration preview should show feature differences
{
  from_version: {
    version: 1,
    features: {
      api_calls: 2000,
      premium_support: true,
      advanced_analytics: true
    }
  },
  to_version: {
    version: 2,
    features: {
      api_calls: 1000,        // ⬇️ Reduced
      premium_support: true,
      // advanced_analytics removed
    }
  },
  impact: {
    features_reduced: ['api_calls'],
    features_removed: ['advanced_analytics'],
    customer_impact: 'high',
    recommended_incentive: '20% discount for 3 months'
  }
}
```

### 5.2 Granular Feature Migration (Future)

Consider allowing feature-level migrations:

```typescript
// Future enhancement: Migrate only specific features
POST /products/:id/features/:featureId/migrate
{
  from_config: { limit: 2000 },
  to_config: { limit: 1000 },
  customer_ids: ["cust_1", "cust_2"],
  compensation: {
    type: "discount",
    percent: 20,
    duration_months: 3
  }
}
```

---

## 6. Testing Feature Changes

### 6.1 Unit Tests

```typescript
describe('Feature Change Detection', () => {
  it('should not version when adding features', async () => {
    const changes = { features: { link: [{ feature_id: 'new_feature' }] } };
    const result = await detectFeatureChanges(productId, changes);
    expect(result.requiresVersioning).toBe(false);
  });

  it('should version when removing features', async () => {
    const changes = { features: { unlink: ['existing_feature'] } };
    const result = await detectFeatureChanges(productId, changes);
    expect(result.requiresVersioning).toBe(true);
  });

  it('should not version when increasing limits', async () => {
    const changes = {
      features: {
        update: [{ feature_id: 'api_calls', config: { limit: 2000 } }]
      }
    };
    // Current limit is 1000
    const result = await detectFeatureChanges(productId, changes);
    expect(result.requiresVersioning).toBe(false);
  });

  it('should version when decreasing limits', async () => {
    const changes = {
      features: {
        update: [{ feature_id: 'api_calls', config: { limit: 500 } }]
      }
    };
    // Current limit is 1000
    const result = await detectFeatureChanges(productId, changes);
    expect(result.requiresVersioning).toBe(true);
    expect(result.triggers[0].description).toContain('500');
  });
});
```

### 6.2 Integration Tests

```typescript
describe('Product Update with Feature Changes', () => {
  it('should create new version when feature limits are reduced', async () => {
    // Setup: Product with customers
    const product = await createProduct({
      features: [{ id: 'api_calls', config: { limit: 1000 } }]
    });
    await createSubscriptions(product.id, 10);

    // Act: Reduce feature limit
    const response = await updateProduct(product.id, {
      features: {
        update: [{ feature_id: 'api_calls', config: { limit: 500 } }]
      }
    });

    // Assert: New version created
    expect(response.version).toBe(2);
    expect(response.parent_product_id).toBe(product.id);

    // Original product marked as superseded
    const original = await getProduct(product.id);
    expect(original.version_status).toBe('superseded');

    // Existing subscriptions still on v1
    const subs = await getSubscriptions(product.id);
    expect(subs.every(s => s.product_id === product.id)).toBe(true);
  });
});
```

---

## 7. Best Practices

### For Product Managers

1. **Always preview changes**: Check the warning modal before confirming
2. **Communicate limit reductions**: Notify customers before reducing limits
3. **Use incentives**: When migrating to lower limits, offer compensation
4. **Batch changes**: Combine multiple changes into one version update
5. **Document reasons**: Explain why limits are being reduced

### For Developers

1. **Type config fields**: Don't use `Record<string, any>` for configs
2. **Validate limits**: Ensure limit values are positive numbers
3. **Log all changes**: Audit trail for feature modifications
4. **Test edge cases**: Null values, type changes, etc.
5. **Consider performance**: Feature comparison shouldn't slow down updates

### For Customer Success

1. **Proactive communication**: Reach out before migrations
2. **Offer alternatives**: If reducing limits, suggest higher tiers
3. **Track satisfaction**: Monitor customer feedback on feature changes
4. **Document FAQs**: Common questions about feature changes

---

## 8. Future Enhancements

### 8.1 Smart Feature Recommendations

```typescript
// Suggest optimal feature configurations based on usage
{
  feature: "api_calls",
  current_limit: 1000,
  average_usage: 750,
  peak_usage: 950,
  recommendation: "Consider increasing to 1500 to prevent limit issues"
}
```

### 8.2 Feature Usage Analytics

```typescript
// Track how features are actually used
{
  feature: "projects_limit",
  limit: 10,
  customers_at_limit: 45,  // 45 customers using all 10 projects
  average_utilization: 0.72,  // 72% of limit used on average
  upgrade_opportunity: true
}
```

### 8.3 Automated Feature Optimization

```typescript
// Automatically suggest version consolidation
{
  products_with_similar_features: [
    { version: 1, features: { api_calls: 1000 }, customers: 10 },
    { version: 2, features: { api_calls: 1100 }, customers: 5 },
    { version: 3, features: { api_calls: 1000 }, customers: 8 }
  ],
  suggestion: "Versions 1 and 3 have identical features. Consider consolidating."
}
```

---

## Summary

Feature changes are a critical part of product versioning:

- **Safe changes** (additions, increases) don't require versioning
- **Breaking changes** (removals, decreases) MUST trigger versioning
- **Detection** happens during product update, before saving
- **Protection** ensures existing customers keep their features
- **Migration** tools help transition customers when ready

The key principle: **Never surprise customers with reduced capabilities**.

---

**Related Documents**:
- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) - Main versioning system design
- [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) - Implementation tasks
- [../PRODUCT_PRICING_STRATEGY_BUSINESS.md](../PRODUCT_PRICING_STRATEGY_BUSINESS.md) - Business strategy