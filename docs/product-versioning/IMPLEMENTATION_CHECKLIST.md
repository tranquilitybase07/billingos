# Product Versioning Implementation Checklist

**Quick reference for engineers implementing the versioning system**

---

## Phase 1: Core Versioning (MVP)

### Database Changes
- [ ] Create migration file: `add_versioning_to_products.sql`
  - [ ] Add `version` column (INTEGER, DEFAULT 1)
  - [ ] Add `parent_product_id` column (UUID, nullable)
  - [ ] Add `latest_version_id` column (UUID, nullable)
  - [ ] Add `version_status` column (VARCHAR, DEFAULT 'current')
  - [ ] Add `version_created_reason` column (TEXT)
  - [ ] Add `version_created_at` column (TIMESTAMPTZ)
  - [ ] Add unique constraint: `(organization_id, name, version)`
  - [ ] Add check constraint: `parent_product_id != id`
- [ ] Run migration on local database
- [ ] Test rollback script

### Backend Changes

#### Products Service (`products.service.ts`)
- [ ] Add `analyzeChanges()` method to detect if versioning needed
  - [ ] Check for price changes (create/archive)
  - [ ] Check for feature limit reductions
  - [ ] Check for feature removals
  - [ ] Check for trial period reduction
- [ ] Add `createProductVersion()` method
  - [ ] Increment version number
  - [ ] Copy product with new ID
  - [ ] Set parent_product_id
  - [ ] Mark old version as 'superseded'
  - [ ] Create Stripe product with version in name
- [ ] Modify `update()` method
  - [ ] Call `getSubscriptionCount()`
  - [ ] If subscriptions > 0, call `analyzeChanges()`
  - [ ] If versioning needed, call `createProductVersion()`
  - [ ] Otherwise, proceed with normal update

#### Products Controller (`products.controller.ts`)
- [ ] Add `GET /products/:id/versions` endpoint
  - [ ] Return all versions with subscription counts
  - [ ] Include revenue calculations
- [ ] Modify `PATCH /products/:id` response
  - [ ] Add `will_version` flag to response
  - [ ] Include affected subscription count

#### DTOs
- [ ] Update `ProductResponseDto`
  - [ ] Add version fields
  - [ ] Add has_active_subscriptions flag
- [ ] Create `ProductVersionsResponseDto`
  - [ ] List of versions with metrics

### Frontend Changes

#### Warning Modal Component
- [ ] Create `VersionWarningModal.tsx`
  - [ ] Display reason for versioning
  - [ ] Show impact (customer counts, revenue)
  - [ ] Confirm/Cancel buttons
- [ ] Add to `EditProductPage.tsx`
  - [ ] Check response for `will_version` flag
  - [ ] Show modal before confirming

#### Product List Updates
- [ ] Add version badge to product cards
  - [ ] Show `[v{version}]` next to product name
  - [ ] Highlight if not latest version
- [ ] Add "View All Versions" link

#### Version History Page
- [ ] Create `ProductVersionsPage.tsx`
  - [ ] List all versions in descending order
  - [ ] Show metrics for each version
  - [ ] Display creation reason and date
- [ ] Add route: `/products/[id]/versions`

### Testing
- [ ] Unit tests for `analyzeChanges()`
- [ ] Unit tests for `createProductVersion()`
- [ ] Integration test: Update product with customers → creates version
- [ ] Integration test: Update product without customers → updates in place
- [ ] E2E test: Complete flow through UI

---

## Phase 2: Migration Tools

### Database Changes
- [ ] Create `product_migrations` table
  - [ ] Migration queue fields
  - [ ] Status tracking
  - [ ] Statistics JSONB

### Backend Changes
- [ ] Create `MigrationService`
  - [ ] `createMigration()` method
  - [ ] `processMigration()` method
  - [ ] `getMigrationStatus()` method
- [ ] Add migration endpoints
  - [ ] `POST /products/:id/migrate`
  - [ ] `GET /products/:id/migration-preview`
  - [ ] `GET /migrations/:id/status`
- [ ] Create migration queue processor
  - [ ] Use BullMQ or similar
  - [ ] Handle Stripe API rate limits
  - [ ] Implement retry logic

### Frontend Changes
- [ ] Create Migration Wizard
  - [ ] Customer selection step
  - [ ] Timing selection step
  - [ ] Incentives configuration step
  - [ ] Review and confirm step
- [ ] Add migration status page
  - [ ] Show progress bar
  - [ ] Display success/failure counts
  - [ ] Allow retry for failures

---

## Phase 3: Analytics Dashboard

### Database Changes
- [ ] Create materialized view: `product_version_analytics`
- [ ] Create indexes for analytics queries

### Backend Changes
- [ ] Create Analytics Service
  - [ ] Revenue by version calculations
  - [ ] Customer distribution metrics
  - [ ] Migration ROI predictions
- [ ] Add analytics endpoints
  - [ ] `GET /products/:id/analytics`
  - [ ] `GET /products/:id/revenue-impact`

### Frontend Changes
- [ ] Create Analytics Dashboard
  - [ ] Version comparison charts
  - [ ] Revenue waterfall diagram
  - [ ] Migration recommendations
- [ ] Add to product detail page
  - [ ] New "Analytics" tab
  - [ ] Quick stats in overview

---

## Pre-Launch Checklist

### Documentation
- [ ] Update API documentation
- [ ] Write merchant guide
- [ ] Create customer FAQ
- [ ] Record demo video

### Monitoring
- [ ] Add metrics for version creation rate
- [ ] Monitor migration success rate
- [ ] Set up alerts for failures

### Feature Flags
- [ ] Create flag: `enable_product_versioning`
- [ ] Create flag: `enable_migration_tools`
- [ ] Create flag: `enable_version_analytics`

### Rollback Plan
- [ ] Test rollback migration script
- [ ] Document rollback procedure
- [ ] Assign on-call responsibilities

---

## Definition of Done

### Phase 1
- [ ] All existing tests pass
- [ ] New tests have >80% coverage
- [ ] Code reviewed by 2 engineers
- [ ] QA testing completed
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Tested with real Stripe test data
- [ ] Performance benchmarks met (<500ms API response)

### Phase 2
- [ ] Migration success rate >90% in testing
- [ ] Queue processing handles 1000 subscriptions
- [ ] Retry logic tested with failures
- [ ] Customer notifications working

### Phase 3
- [ ] Analytics load in <2 seconds
- [ ] Charts render correctly
- [ ] Calculations verified against spreadsheet
- [ ] Caching working as expected

---

**Remember**: The goal is to protect existing customers while giving merchants control over their pricing evolution.