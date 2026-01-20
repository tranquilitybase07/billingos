# Feature Creation Implementation Plan

**Created**: 2026-01-19
**Status**: In Progress
**Feature**: Feature creation workflow in product creation page

## Problem Statement

The product creation page has a "Add Feature" button with a dropdown that includes a "Create New" option, but clicking it does nothing. Users need a seamless way to create new features while building a product.

## Solution Overview

Build a comprehensive feature creation system that:
- Allows inline feature creation from product page
- Provides feature templates for quick setup
- Uses React Hook Form + Zod for validation
- Auto-adds created features to the product
- Reusable across the application

## Technical Decisions

### UI Pattern: Sheet/Drawer
**Decision**: Use Sheet component (drawer from right) for feature creation
**Reasoning**:
- Comprehensive form needs more space than a modal
- Keeps user in context of product creation
- Better UX than navigating to separate page
- Fallback to Dialog on mobile for responsive design

### Form Library: React Hook Form + Zod
**Decision**: Use react-hook-form with zod validation
**Reasoning**:
- Already installed in project (v7.69.0, v4.2.1)
- Best practice for complex forms
- Type-safe validation
- Matches backend DTO structure

### Feature Templates
**Decision**: Provide 6 pre-configured templates
**Reasoning**:
- Faster onboarding for common use cases
- Educates users on feature types
- Reduces errors in configuration

**Templates**:
1. API Calls (usage_quota)
2. Storage Limit (numeric_limit)
3. Team Members (numeric_limit)
4. Advanced Analytics (boolean_flag)
5. Priority Support (boolean_flag)
6. Custom Branding (boolean_flag)

## Architecture

### Component Structure

```
CreateFeatureDialog (Sheet/Dialog)
├── Tabs
│   ├── Templates Tab
│   │   └── TemplateCard[] (6 templates)
│   └── Custom Tab
│       └── FeatureForm (React Hook Form)
│           ├── Name (auto-generated slug)
│           ├── Title
│           ├── Description
│           ├── Type (Select)
│           ├── Properties (JSON textarea)
│           └── Metadata (JSON textarea)
└── Actions (Cancel, Create)
```

### Data Flow

```
User clicks "Create New" in FeatureSelector
    ↓
CreateFeatureDialog opens
    ↓
User selects template OR fills custom form
    ↓
Form validates with Zod schema
    ↓
Submit → useCreateFeature() mutation
    ↓
API creates feature in DB + Stripe
    ↓
Success → onFeatureCreated callback
    ↓
Auto-add to product's feature list + Toast notification
    ↓
Dialog closes
```

### API Integration

**Endpoint**: `POST /features`

**Payload** (CreateFeatureDto):
```typescript
{
  organization_id: string
  name: string           // lowercase_underscored
  title: string          // max 255 chars
  description?: string
  type: 'boolean_flag' | 'usage_quota' | 'numeric_limit'
  properties?: Record<string, any>
  metadata?: Record<string, any>
}
```

**Response**: `Feature` object

**Validation Rules**:
- name: `/^[a-z0-9_]+$/` (lowercase, numbers, underscores)
- title: required, max 255 chars
- type: enum validation
- organization_id: required

## File Structure

### New Files
```
apps/web/src/
├── lib/
│   ├── validations/
│   │   └── feature.ts                    # Zod schema
│   └── constants/
│       └── feature-templates.ts          # Template definitions
├── components/
│   ├── Features/
│   │   ├── FeatureTypeIcon.tsx          # Type indicator icons
│   │   └── CreateFeatureDialog.tsx      # Main creation dialog
│   └── ui/
│       └── form.tsx                      # shadcn form (to install)
```

### Modified Files
```
apps/web/src/
├── components/Products/
│   └── FeatureSelector.tsx              # Add "Create New" button + dialog
└── app/dashboard/[organization]/(header)/products/
    ├── features/                         # Rename from benefits/
    │   ├── page.tsx
    │   └── FeaturesPage.tsx
```

## Implementation Steps

### Phase 1: Foundation
1. ✅ Create documentation (plan.md, progress.md)
2. Install shadcn form component
3. Create Zod validation schema
4. Create feature templates constants

### Phase 2: UI Components
5. Build FeatureTypeIcon component
6. Build CreateFeatureDialog component
   - Templates tab with pre-configured options
   - Custom tab with full form
   - React Hook Form integration
   - Zod validation
   - Auto-slug generation

### Phase 3: Integration
7. Update FeatureSelector component
   - Add "Create New" button
   - Integrate CreateFeatureDialog
   - Handle auto-add on creation
   - Add type icons to feature list

8. Migrate Benefits page → Features page
   - Rename routes
   - Connect to features API
   - Add DataTable for listing
   - CRUD operations

### Phase 4: Polish
9. Visual enhancements
   - Empty state illustrations
   - Template cards styling
   - Loading states
   - Responsive design
   - Type icons everywhere

10. Testing & documentation
    - End-to-end testing
    - Update final.md

## Dependencies

### Existing (Already Installed)
- react-hook-form: v7.69.0
- zod: v4.2.1
- lucide-react: v0.562.0
- @tanstack/react-query (for mutations)

### To Install
- shadcn form component (wraps react-hook-form)

### UI Components Available
- Sheet (drawer)
- Dialog (modal)
- Tabs
- Command (for search)
- Popover
- Select, Input, Textarea, Label

## Success Criteria

✅ User can create features inline from product creation page
✅ "Create New" button in FeatureSelector opens dialog
✅ Templates provide quick-start options
✅ Custom form has full validation
✅ Created features auto-add to product
✅ Success toast shows confirmation
✅ Features page lists all features with CRUD
✅ Type icons provide visual clarity
✅ Responsive on mobile and desktop
✅ Reusable component for other pages

## UX Enhancements

### Feature Type Icons
- **boolean_flag**: Flag icon (blue)
- **usage_quota**: Activity/Gauge icon (green)
- **numeric_limit**: Hash icon (purple)

### Empty States
- FeatureSelector: "No features added yet" with icon
- Templates tab: Grid of template cards
- Features page: "Create your first feature" illustration

### Auto-Slug Generation
- Title: "API Calls per Month" → name: "api_calls_per_month"
- Real-time preview as user types
- Validation indicator

### Template Cards
- Visual icon for each type
- Title and description
- "Use Template" button
- Pre-fills all fields when selected

## Risk Mitigation

### Potential Issues
1. **Form validation conflicts**: Backend has strict name regex
   - Solution: Mirror exact regex in Zod schema
   - Show real-time validation feedback

2. **Auto-add to product state**: Need to preserve other form data
   - Solution: Use callback pattern, parent manages state

3. **Mobile UX**: Drawer might be too wide
   - Solution: Use Dialog on small screens

4. **Duplicate names**: User creates feature with existing name
   - Solution: Backend returns error, show toast
   - Future: Check existing names before submit

## Future Enhancements

- Feature categories/tags
- Icon picker for features
- Bulk import from CSV
- Feature usage analytics
- Feature dependencies (requires X to use Y)
- Advanced properties editor (not just JSON textarea)

## Reference

**Backend Files**:
- `/apps/api/src/features/features.controller.ts`
- `/apps/api/src/features/dto/create-feature.dto.ts`

**Frontend Files**:
- `/apps/web/src/hooks/queries/features.ts`
- `/apps/web/src/components/Products/FeatureSelector.tsx`

**Polar Reference**:
- Check `/Users/ankushkumar/Code/payment/billingos` for benefit/feature patterns
