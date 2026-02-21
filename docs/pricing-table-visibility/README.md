# Pricing Table Visibility Control

## Overview
Products in BillingOS can now be controlled for visibility in the public pricing table displayed via the SDK. This allows organizations to have products that are only for internal use or specific customers while keeping them hidden from the public pricing page.

## Database Field
- **Field Name**: `visible_in_pricing_table`
- **Type**: Boolean
- **Default**: `true` (products are visible by default)
- **Location**: `products` table

## Usage Examples

### Creating a Product (Visible by Default)
```typescript
// Product will be visible in pricing table by default
const visibleProduct = await fetch('/api/products', {
  method: 'POST',
  body: JSON.stringify({
    organization_id: 'org-123',
    name: 'Pro Plan',
    description: 'Our most popular plan',
    recurring_interval: 'month',
    prices: [...],
    // visible_in_pricing_table: true (default)
  })
});
```

### Creating a Hidden Product
```typescript
// Create a product that won't show in the pricing table
const hiddenProduct = await fetch('/api/products', {
  method: 'POST',
  body: JSON.stringify({
    organization_id: 'org-123',
    name: 'Enterprise Custom',
    description: 'Custom enterprise solution',
    recurring_interval: 'month',
    visible_in_pricing_table: false, // Hide from public pricing
    prices: [...]
  })
});
```

### Updating Product Visibility
```typescript
// Hide an existing product
await fetch(`/api/products/${productId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    visible_in_pricing_table: false
  })
});

// Show a previously hidden product
await fetch(`/api/products/${productId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    visible_in_pricing_table: true
  })
});
```

## SDK Behavior
When the SDK fetches products via `/v1/products`, it automatically filters to only show products where `visible_in_pricing_table = true`.

### SDK Response Example
```typescript
// Only visible products are returned
const response = await billingOS.products.list();
// Returns: [
//   { id: 'prod-1', name: 'Starter', visible_in_pricing_table: true, ... },
//   { id: 'prod-2', name: 'Pro', visible_in_pricing_table: true, ... }
// ]
// Hidden products (visible_in_pricing_table: false) are excluded
```

## Use Cases

### 1. Internal Testing Products
Create products for internal testing without showing them to customers:
```typescript
{
  name: 'QA Test Plan',
  visible_in_pricing_table: false,
  ...
}
```

### 2. Legacy Products
Keep old products active for existing customers but hide from new signups:
```typescript
// Update legacy product
{
  visible_in_pricing_table: false // Hide from new customers
}
```

### 3. Custom Enterprise Plans
Create custom negotiated plans that shouldn't appear in public pricing:
```typescript
{
  name: 'ACME Corp Custom',
  visible_in_pricing_table: false,
  metadata: { customer: 'acme-corp' }
}
```

### 4. Beta/Early Access Products
Products in beta that aren't ready for public release:
```typescript
{
  name: 'AI Features (Beta)',
  visible_in_pricing_table: false,
  metadata: { beta: true }
}
```

## Migration Steps

To apply this feature after pulling the latest code:

1. **Start Docker Desktop** (required for Supabase)

2. **Apply the migration**:
```bash
# Reset database to apply all migrations
supabase db reset

# Or if you want to keep existing data, just restart Supabase
supabase stop
supabase start
```

3. **Regenerate TypeScript types**:
```bash
supabase gen types typescript --local > packages/shared/types/database.ts
```

4. **Restart the development environment**:
```bash
pnpm dev
```

## Database Query Examples

```sql
-- See all products with visibility status
SELECT id, name, visible_in_pricing_table
FROM products
WHERE organization_id = 'your-org-id';

-- Update multiple products to hidden
UPDATE products
SET visible_in_pricing_table = false
WHERE name LIKE '%Legacy%';

-- Count visible vs hidden products
SELECT
  visible_in_pricing_table,
  COUNT(*) as count
FROM products
WHERE is_archived = false
GROUP BY visible_in_pricing_table;
```

## API Endpoints

- **Admin API** (`/products`): Returns ALL products (visible and hidden) for management
- **SDK API** (`/v1/products`): Returns ONLY visible products for pricing tables

## Notes
- The field defaults to `true` to maintain backward compatibility
- Existing products will be visible by default after migration
- This doesn't affect billing - hidden products can still be used for subscriptions
- Hidden products can still be accessed directly via their ID for checkout flows