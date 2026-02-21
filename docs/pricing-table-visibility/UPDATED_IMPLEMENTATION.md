# Updated Product Visibility Implementation

## Overview
Based on feedback, the visibility toggle has been moved from the form to a standalone toggle in the page header. This provides a better UX as it doesn't require saving the entire form and doesn't trigger versioning checks.

## Key Changes

### 1. Header Toggle (Not in Form)
- Visibility toggle now appears in the page header next to the title
- Instant toggle without needing to save the entire form
- No versioning checks - visibility changes don't affect existing subscriptions
- 500ms debounce to prevent rapid API calls

### 2. Visual Design
- Clean toggle with eye/eye-off icons
- Shows current state: "Visible in pricing" or "Hidden from pricing"
- Info icon with tooltip explaining the feature
- Consistent placement in both Edit and Create pages

### 3. Implementation Details

#### Custom Hook: `useProductVisibility`
```typescript
// Handles visibility toggling with debouncing
const { isVisible, toggleVisibility, isUpdating } = useProductVisibility(product);
```

Features:
- 500ms debounce on API calls
- Optimistic UI updates (toggles immediately, reverts on error)
- Toast notifications for success/failure
- Clean loading states

#### Edit Product Page
- Toggle in header, separate from form
- No versioning triggered when toggling visibility
- Updates happen independently of form saves

#### Create Product Page
- Toggle in header to set initial visibility
- Visibility value included when creating the product
- Default is visible (true)

### 4. Benefits of This Approach

✅ **No Versioning Overhead**: Visibility changes don't create new product versions
✅ **Instant Feedback**: Toggle updates immediately with optimistic UI
✅ **Better UX**: No need to scroll to find the setting or save the entire form
✅ **Cleaner Form**: Form focuses on product details, visibility is a separate concern
✅ **Debounced**: Prevents API spam with 500ms debounce

### 5. Backend Behavior

The visibility toggle:
- Updates only the `visible_in_pricing_table` field
- Skips versioning analysis completely
- Doesn't affect Stripe products
- Doesn't affect active subscriptions
- Only changes whether the product appears in SDK queries

### 6. Database Query

When toggling visibility, the backend runs a simple update:
```sql
UPDATE products
SET visible_in_pricing_table = $1
WHERE id = $2
```

No complex versioning logic, no subscription checks, just a simple flag update.

### 7. UI States

#### Visible Product (Default)
- Eye icon (👁️)
- Text: "Visible in pricing"
- Toggle ON

#### Hidden Product
- Eye-off icon (👁️‍🗨️)
- Text: "Hidden from pricing"
- Toggle OFF

### 8. Testing

To test the new implementation:

1. **Edit Page**: Navigate to any product's edit page
   - Look for the toggle in the header (top right)
   - Toggle it and see instant feedback
   - No need to save the form

2. **Create Page**: Create a new product
   - Toggle visibility before creating
   - Product will be created with selected visibility

3. **List Page**: Check the product list
   - Hidden products show "Hidden from pricing" indicator
   - Dropdown menu has quick toggle option

### 9. Migration Path

For existing implementations:
1. Remove visibility from form submissions
2. Add the `useProductVisibility` hook for edit pages
3. Add local state for visibility on create pages
4. Move toggle to page header
5. Add info tooltip for user education

## Conclusion

This implementation provides a cleaner, more intuitive interface for managing product visibility. By separating it from the form and avoiding versioning checks, we've made it a lightweight operation that users can toggle instantly without worrying about side effects.