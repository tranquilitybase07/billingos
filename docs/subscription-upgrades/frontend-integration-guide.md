# Subscription Upgrade/Downgrade - Frontend Integration Guide

## Overview

This guide shows how to integrate the subscription upgrade/downgrade UI components into your application.

---

## Components Created

### 1. PlanChangeModal
**Location**: `apps/web/src/components/Subscriptions/PlanChangeModal.tsx`

Main modal component that orchestrates the entire plan change flow.

**Features**:
- Displays current plan
- Shows available upgrades and downgrades
- Handles plan selection
- Shows proration preview
- Confirms plan changes

### 2. ProrationPreview
**Location**: `apps/web/src/components/Subscriptions/ProrationPreview.tsx`

Component that displays the billing breakdown for a plan change.

**Features**:
- Shows credit for unused time
- Displays prorated charge for new plan
- Calculates total amount due
- Shows effective date
- Displays important notes

### 3. PlanComparisonCard
**Location**: `apps/web/src/components/Subscriptions/PlanComparisonCard.tsx`

Card component for displaying individual plans.

**Features**:
- Shows plan name, description, and price
- Indicates current plan
- Shows upgrade/downgrade badge
- Provides select button

---

## API Integration

### TypeScript Types
**Location**: `apps/web/src/lib/api/types.ts`

Added types:
- `PreviewChangeResponse`
- `PreviewChangeDTO`
- `ChangePlanDTO`
- `ChangePlanResponse`
- `AvailablePlansResponse`
- `AvailablePlan`
- `PlanInfo`
- `ProrationInfo`

### API Client Methods
**Location**: `apps/web/src/lib/api/client.ts`

Added methods under `api.subscriptions`:
```typescript
api.subscriptions.previewChange(subscriptionId, { new_price_id, effective_date })
api.subscriptions.changePlan(subscriptionId, { new_price_id, confirm_amount, effective_date })
api.subscriptions.getAvailablePlans(subscriptionId)
```

### React Query Hooks
**Location**: `apps/web/src/hooks/queries/subscriptions.ts`

Added hooks:
- `useAvailablePlans(subscriptionId)` - Fetches available plans
- `usePreviewPlanChange()` - Mutation for previewing changes
- `useChangePlan()` - Mutation for executing plan changes

---

## Usage Example

### In a Subscription Details Page

```tsx
'use client'

import { useState } from 'react'
import { PlanChangeModal } from '@/components/Subscriptions/PlanChangeModal'
import { Button } from '@/components/atoms/Button'
import { useSubscription } from '@/hooks/queries/subscriptions'

export default function SubscriptionPage({ subscriptionId }: { subscriptionId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: subscription, refetch } = useSubscription(subscriptionId)

  return (
    <div>
      {/* Subscription Details */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Subscription Details</h1>
        {subscription && (
          <div className="space-y-2">
            <p>Status: {subscription.status}</p>
            <p>Amount: ${subscription.amount / 100}</p>
            <p>Next billing: {new Date(subscription.current_period_end).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      {/* Change Plan Button */}
      <Button onClick={() => setIsModalOpen(true)}>
        Change Plan
      </Button>

      {/* Plan Change Modal */}
      <PlanChangeModal
        subscriptionId={subscriptionId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          refetch() // Refresh subscription data
        }}
      />
    </div>
  )
}
```

### In a Billing Page

```tsx
'use client'

import { useState } from 'react'
import { PlanChangeModal } from '@/components/Subscriptions/PlanChangeModal'
import { Button } from '@/components/atoms/Button'
import { useOrganizationSubscriptions } from '@/hooks/queries/subscriptions'

export default function BillingPage({ organizationId }: { organizationId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedSubscription, setSelectedSubscription] = useState<string | null>(null)

  const { data: subscriptions, refetch } = useOrganizationSubscriptions(organizationId)

  const handleChangePlan = (subscriptionId: string) => {
    setSelectedSubscription(subscriptionId)
    setIsModalOpen(true)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing & Subscriptions</h1>

      {/* List of Subscriptions */}
      <div className="space-y-4">
        {subscriptions?.map((sub) => (
          <div key={sub.id} className="border p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{sub.product?.name}</h3>
                <p className="text-sm text-gray-600">
                  ${sub.amount / 100} / {sub.price?.recurring_interval}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => handleChangePlan(sub.id)}
              >
                Change Plan
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Plan Change Modal */}
      {selectedSubscription && (
        <PlanChangeModal
          subscriptionId={selectedSubscription}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedSubscription(null)
          }}
          onSuccess={() => {
            refetch() // Refresh subscriptions list
          }}
        />
      )}
    </div>
  )
}
```

---

## Flow Diagram

```
User Flow:
1. User clicks "Change Plan" button
2. PlanChangeModal opens
3. Modal fetches available plans via useAvailablePlans()
4. User sees current plan + available upgrades/downgrades
5. User selects a new plan
6. Modal calls usePreviewPlanChange() to show proration
7. ProrationPreview displays costs and details
8. User clicks "Confirm Upgrade/Downgrade"
9. Modal calls useChangePlan() to execute
10. Success toast shown
11. Modal closes
12. Parent component refetches subscription data
```

---

## Styling & Customization

### Theme Support
All components support dark mode via Tailwind CSS dark: variants.

### Customizable Props

**PlanChangeModal**:
```typescript
interface PlanChangeModalProps {
  subscriptionId: string      // Required
  isOpen: boolean             // Required
  onClose: () => void         // Required
  onSuccess?: () => void      // Optional callback
}
```

**PlanComparisonCard**:
```typescript
interface PlanComparisonCardProps {
  plan: AvailablePlan         // Required
  isCurrentPlan?: boolean     // Optional
  onSelect?: () => void       // Optional
  isLoading?: boolean         // Optional
  changeType: 'upgrade' | 'downgrade' // Required
}
```

**ProrationPreview**:
```typescript
interface ProrationPreviewProps {
  currentPlan: PlanInfo       // Required
  newPlan: PlanInfo          // Required
  proration: ProrationInfo    // Required
  changeType: 'upgrade' | 'downgrade' // Required
  effectiveDate: string       // Required
  notes?: string[]           // Optional
}
```

---

## Error Handling

All components include built-in error handling:

1. **Loading States**: Skeleton loaders and spinners during API calls
2. **Error Messages**: User-friendly error alerts
3. **Validation**: Client-side validation before API calls
4. **Retry Logic**: React Query automatic retries on failure
5. **Toast Notifications**: Success/error toasts via useToast()

### Example Error Handling

```tsx
const { data, error, isLoading } = useAvailablePlans(subscriptionId)

if (isLoading) {
  return <LoadingSpinner />
}

if (error) {
  return <Alert variant="destructive">Failed to load plans</Alert>
}

if (!data || data.available_upgrades.length === 0) {
  return <Alert>No plans available for upgrade</Alert>
}
```

---

## Accessibility

Components follow accessibility best practices:

- ✅ Keyboard navigation support
- ✅ ARIA labels on interactive elements
- ✅ Focus management in modals
- ✅ Screen reader friendly
- ✅ High contrast mode support
- ✅ Semantic HTML structure

---

## Testing the UI

### Manual Testing Checklist

1. **Open Modal**:
   - [ ] Modal opens when button clicked
   - [ ] Available plans load correctly
   - [ ] Current plan is highlighted

2. **Select Plan**:
   - [ ] Clicking a plan shows preview
   - [ ] Preview shows correct amounts
   - [ ] Loading spinner appears during preview

3. **Confirm Change**:
   - [ ] Confirmation view displays correctly
   - [ ] Confirm button executes change
   - [ ] Success message appears
   - [ ] Modal closes on success

4. **Error Cases**:
   - [ ] Network errors show alert
   - [ ] Invalid changes are blocked
   - [ ] User can retry after error

5. **Edge Cases**:
   - [ ] No plans available message
   - [ ] Same plan change blocked
   - [ ] Free plan upgrade works
   - [ ] Downgrade shows period-end note

### Example Test Code

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PlanChangeModal } from './PlanChangeModal'

test('opens modal and displays plans', async () => {
  render(
    <PlanChangeModal
      subscriptionId="sub_123"
      isOpen={true}
      onClose={jest.fn()}
    />
  )

  await waitFor(() => {
    expect(screen.getByText('Change Your Plan')).toBeInTheDocument()
    expect(screen.getByText('Current Plan')).toBeInTheDocument()
  })
})
```

---

## Performance Optimizations

1. **React Query Caching**: Plans cached for 5 minutes
2. **Lazy Loading**: Modal content loads only when opened
3. **Debounced API Calls**: Prevents rapid-fire requests
4. **Optimistic Updates**: UI updates before API confirms
5. **Skeleton Loaders**: Immediate visual feedback

---

## Common Issues & Solutions

### Issue: Modal doesn't open
**Solution**: Ensure `isOpen` prop is set to `true`

### Issue: No plans shown
**Solution**: Check that subscription has valid organization and products exist

### Issue: Preview shows $0
**Solution**: Verify both plans have same currency and interval

### Issue: Confirm button disabled
**Solution**: Check that preview has loaded successfully

### Issue: TypeScript errors
**Solution**: Ensure all types imported from `@/lib/api/types`

---

## Next Steps

### Phase 2 Enhancements (Future)
- [ ] Add ability to change effective date (immediate vs period end)
- [ ] Show change history in modal
- [ ] Display account credit balance
- [ ] Allow cancelling scheduled downgrades
- [ ] Email preview before confirming

### Phase 3 Enhancements (Future)
- [ ] Support quantity changes (seats)
- [ ] Cross-interval upgrades (monthly ↔ yearly)
- [ ] Custom proration options
- [ ] Trial extensions on upgrade
- [ ] Bulk plan changes

---

## Support

For questions or issues:
1. Check the [Implementation Summary](./implementation-summary.md)
2. Review the [Plan Document](./plan.md)
3. Check API endpoint documentation
4. Test with Postman/Thunder Client first

---

## Quick Reference

### Import Statements
```typescript
// Components
import { PlanChangeModal } from '@/components/Subscriptions/PlanChangeModal'
import { ProrationPreview } from '@/components/Subscriptions/ProrationPreview'
import { PlanComparisonCard } from '@/components/Subscriptions/PlanComparisonCard'

// Hooks
import {
  useAvailablePlans,
  usePreviewPlanChange,
  useChangePlan,
} from '@/hooks/queries/subscriptions'

// Types
import type {
  PreviewChangeResponse,
  ChangePlanResponse,
  AvailablePlan,
} from '@/lib/api/types'
```

### API Endpoints
```
GET    /api/subscriptions/:id/available-plans
POST   /api/subscriptions/:id/preview-change
POST   /api/subscriptions/:id/change-plan
```

### Hook Usage
```typescript
// Fetch available plans
const { data } = useAvailablePlans(subscriptionId)

// Preview a change
const previewMutation = usePreviewPlanChange()
await previewMutation.mutateAsync({
  subscriptionId,
  data: { new_price_id: 'price_123' }
})

// Execute change
const changeMutation = useChangePlan()
await changeMutation.mutateAsync({
  subscriptionId,
  data: {
    new_price_id: 'price_123',
    confirm_amount: 1999
  }
})
```

---

## Files Created

### Components
1. `/apps/web/src/components/Subscriptions/PlanChangeModal.tsx`
2. `/apps/web/src/components/Subscriptions/ProrationPreview.tsx`
3. `/apps/web/src/components/Subscriptions/PlanComparisonCard.tsx`

### Hooks
4. `/apps/web/src/hooks/queries/subscriptions.ts` (updated)

### API & Types
5. `/apps/web/src/lib/api/client.ts` (updated)
6. `/apps/web/src/lib/api/types.ts` (updated)

### Documentation
7. `/docs/subscription-upgrades/frontend-integration-guide.md` (this file)
