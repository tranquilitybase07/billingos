# Multi-Currency Implementation Plan for BillingOS Marketplace

## Current State Summary

✅ **Good news**: Your database already has currency fields in all payment tables
✅ **Frontend** has sophisticated currency formatting utilities
⚠️ **Issue**: Everything defaults to 'usd' (42 hardcoded instances found)
❌ **Missing**: Organization-level currency settings

## Implementation Plan - Organization-Level Currency

### Phase 1: Database Schema Updates

1. **Add currency fields to organizations table**
   - `default_currency` - Organization's billing currency
   - `supported_currencies` - Array of currencies they accept (optional)

2. **Add currency tracking**
   - Add `preferred_currency` to customers table
   - Create audit table for currency changes

### Phase 2: Backend API Updates

1. **Organization Service** (`apps/api/src/organization/`)
   - Add currency field to CreateOrganizationDto
   - Add endpoint to update organization currency
   - Validate against Stripe's supported currency list

2. **Products Service** (`apps/api/src/products/`)
   - Inherit currency from organization when creating products
   - Remove hardcoded 'usd' defaults
   - Use organization's currency for all new prices

3. **Checkout Service** (`apps/api/src/checkout/`)
   - Use price's currency (set by organization)
   - Validate currency consistency in cart items
   - Pass correct currency to Stripe PaymentIntent

4. **Fix hardcoded defaults** (42 instances)
   - Replace all 'usd' defaults with organization currency
   - Update DTOs to fetch from organization
   - Fix test fixtures

### Phase 3: Frontend Updates

1. **Organization Setup** (`apps/web/src/app/dashboard/create/`)
   - Add currency selector during organization creation
   - Show supported currencies list (start with 10-15 major ones)

2. **Settings Page** (`apps/web/src/app/dashboard/[organization]/settings/`)
   - Add currency management section
   - Show warning about subscription limitations

3. **Product Creation**
   - Display organization's currency (read-only)
   - Remove ability to change currency per-product

### Phase 4: SDK Updates

1. **Display currency properly**
   - Pricing tables show organization's currency
   - Checkout uses organization's currency

2. **API responses include currency**
   - Ensure all price responses include currency field

## Important Stripe Limitations

⚠️ **Subscription Currency Lock**: Once a customer has an active subscription, they cannot have another subscription in a different currency
⚠️ **No Currency Changes**: Changing currency requires canceling and recreating subscriptions
⚠️ **Stripe Connect**: Each connected account has its own currency for payouts

## Migration Strategy

1. Set all existing organizations to 'usd' as default
2. New organizations can choose their currency
3. Existing organizations can change (with warnings about subscriptions)

## Testing Requirements

- Unit tests for currency validation
- Integration tests with Stripe API
- Manual testing with 5-10 major currencies
- Automated tests for currency formatting

## Estimated Complexity

- **Database**: Simple (1-2 hours)
- **Backend**: Moderate (4-6 hours) - mostly removing hardcoded values
- **Frontend**: Simple (2-3 hours) - add currency selector
- **Testing**: Moderate (3-4 hours)
- **Total**: ~1-2 days of focused work

## Future Enhancements (Not in Phase 1)

- Multi-currency pricing per product (complex)
- Automatic currency conversion for reports
- Location-based currency detection
- Exchange rate management

## Implementation Order

1. Start with database schema updates
2. Update backend services to use organization currency
3. Add frontend currency selector
4. Update SDK to display correct currency
5. Comprehensive testing
6. Migration of existing data

## Success Criteria

- [ ] Organizations can select their billing currency during setup
- [ ] All new products inherit organization's currency
- [ ] No hardcoded 'usd' defaults remain in codebase
- [ ] Checkout process respects organization's currency
- [ ] SDK displays prices in correct currency
- [ ] Existing organizations continue working with USD
- [ ] Currency validation prevents invalid selections