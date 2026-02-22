# Testing the Product Visibility Feature

## Quick Manual Test Guide

### Prerequisites
1. Start Docker Desktop
2. Run `supabase start` to start the local database
3. Run `pnpm dev` to start both frontend and backend servers

### Test Steps

#### 1. Test Creating a Hidden Product
1. Navigate to **Dashboard > Products**
2. Click **New Product**
3. Fill in basic details (name, description, price)
4. Look for the **Visibility Settings** section
5. Toggle **"Show in Pricing Table"** to OFF
6. Click **Publish to Stripe**
7. Verify the product shows in the list with a **"Hidden from pricing"** indicator

#### 2. Test Creating a Visible Product
1. Create another product with visibility toggle ON (default)
2. Verify it does NOT show the "Hidden from pricing" indicator

#### 3. Test Toggling Visibility from List View
1. In the products list, click the three-dot menu (⋮) on any product
2. Look for **"Hide from Pricing Table"** or **"Show in Pricing Table"** option
3. Click it and verify:
   - Toast notification appears confirming the change
   - Product updates to show/hide the visibility indicator

#### 4. Test Editing Product Visibility
1. Click on any product to view details
2. Click **Edit Product**
3. Find the **Visibility Settings** card
4. Toggle the switch and observe the description changes
5. Save changes
6. Verify the product list reflects the change

#### 5. Test SDK Filtering (Requires SDK Setup)
If you have the SDK test app set up:
1. Create 2 products: one visible, one hidden
2. Open the test app that uses the SDK
3. Call the products API endpoint
4. Verify only visible products are returned

### Expected UI Elements

#### In Product List:
- Hidden products show: 👁️‍🗨️ "Hidden from pricing" text under the product name
- Dropdown menu has visibility toggle option with appropriate icon

#### In Create/Edit Forms:
- **Visibility Settings** card between Basic Information and Pricing Engine
- Toggle switch with eye/eye-off icons
- Dynamic description text that changes based on toggle state
- Helper text explaining the feature

### Visual Indicators

#### When Visible (Default):
- 👁️ Eye icon
- Text: "This product is visible to customers in your pricing page"
- No special badge in list view

#### When Hidden:
- 👁️‍🗨️ Eye-off icon
- Text: "This product is hidden from your public pricing page"
- "Hidden from pricing" indicator in list view
- Muted text color for the indicator

### Database Verification

To verify in the database:
```sql
-- Check all products with their visibility status
SELECT id, name, visible_in_pricing_table
FROM products
WHERE organization_id = 'your-org-id';

-- Count visible vs hidden
SELECT
  visible_in_pricing_table,
  COUNT(*) as count
FROM products
WHERE is_archived = false
GROUP BY visible_in_pricing_table;
```

### API Testing with cURL

```bash
# Get AUTH_TOKEN from browser DevTools after logging in
AUTH_TOKEN="your-auth-token"
ORG_ID="your-org-id"

# Create a hidden product
curl -X POST http://localhost:3001/products \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "'$ORG_ID'",
    "name": "Hidden Test Product",
    "visible_in_pricing_table": false,
    "recurring_interval": "month",
    "prices": [{
      "amount_type": "fixed",
      "price_amount": 999,
      "price_currency": "usd"
    }]
  }'

# Toggle visibility
PRODUCT_ID="product-id-from-above"
curl -X PATCH http://localhost:3001/products/$PRODUCT_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visible_in_pricing_table": true}'
```

### Troubleshooting

**Issue: Field not appearing in UI**
- Solution: Make sure to restart `pnpm dev` after pulling changes

**Issue: Database field missing**
- Solution: Run `supabase db reset` to apply the migration
- Then regenerate types: `supabase gen types typescript --local > packages/shared/types/database.ts`

**Issue: Products not filtering in SDK**
- Check that the V1ProductsService has the filter: `.eq('visible_in_pricing_table', true)`
- Verify the field is in the database by checking the products table directly

**Issue: Toggle not saving**
- Check browser console for errors
- Verify the updateProduct mutation includes the visible_in_pricing_table field
- Check network tab to see if the PATCH request includes the field