# Ankush - Backend APIs + Integration Tasks

**Role:** Full Stack (Backend Focus)
**Sprint Duration:** 2-3 weeks
**Total Tasks:** 8

## Week 1: API Completion (Days 1-5)

### Task 1: Create Customers API Module ⭐ HIGH PRIORITY
**Estimated Time:** 6-8 hours
**Dependencies:** None
**Blocks:** Aakash's Customers UI

#### Description
Build complete CRUD API for customer management with Stripe sync.

#### Implementation Steps
1. **Reference Polar's Implementation**
   - Location: `/Users/ankushkumar/Code/payment/billingos`
   - Study: Customers module, Stripe customer sync patterns
   - Document: API endpoints, DTOs, service methods

2. **Generate NestJS Module**
   ```bash
   cd apps/api
   nest g module customers
   nest g service customers
   nest g controller customers
   ```

3. **Create DTOs** (`src/customers/dto/`)
   - `create-customer.dto.ts` - name, email, metadata
   - `update-customer.dto.ts` - partial update fields
   - `list-customers.dto.ts` - pagination, filters

4. **Implement Service** (`src/customers/customers.service.ts`)
   ```typescript
   // Key methods:
   - async create(organizationId: string, dto: CreateCustomerDto)
     // 1. Create in Supabase customers table
     // 2. Create Stripe customer
     // 3. Store stripe_customer_id

   - async findAll(organizationId: string, query: ListCustomersDto)
     // Filter: status, email, date range
     // Paginate: limit, offset

   - async findOne(id: string)
     // Join with subscriptions table

   - async update(id: string, dto: UpdateCustomerDto)
     // Update both Supabase and Stripe

   - async syncFromStripe(stripeCustomerId: string)
     // Webhook handler: customer.created, customer.updated
   ```

5. **Create Controller Endpoints**
   ```typescript
   @UseGuards(JwtAuthGuard)
   @Controller('customers')

   GET    /customers          - List all customers for org
   GET    /customers/:id      - Get single customer details
   POST   /customers          - Create new customer
   PATCH  /customers/:id      - Update customer
   DELETE /customers/:id      - Archive customer (soft delete)
   ```

6. **Add Stripe Integration**
   - Create customer in Stripe when creating in DB
   - Sync customer metadata
   - Handle webhook events: customer.created, customer.updated, customer.deleted

7. **Add to Stripe Webhook Handler** (`src/stripe/stripe.controller.ts`)
   ```typescript
   case 'customer.created':
   case 'customer.updated':
   case 'customer.deleted':
     await this.customersService.handleWebhook(event);
   ```

#### Files to Create
- `apps/api/src/customers/customers.module.ts`
- `apps/api/src/customers/customers.service.ts`
- `apps/api/src/customers/customers.controller.ts`
- `apps/api/src/customers/dto/create-customer.dto.ts`
- `apps/api/src/customers/dto/update-customer.dto.ts`
- `apps/api/src/customers/dto/list-customers.dto.ts`

#### Testing Checklist
- [ ] Create customer creates in both DB and Stripe
- [ ] List customers with filters works
- [ ] Update syncs to Stripe
- [ ] Webhook events update DB correctly
- [ ] Pagination works properly
- [ ] Org isolation (users can only see their org's customers)

---

### Task 2: Create Analytics API Module ⭐ HIGH PRIORITY
**Estimated Time:** 8-10 hours
**Dependencies:** None
**Blocks:** Aakash's Analytics Dashboard

#### Description
Build analytics endpoints for MRR, active subscriptions, churn rate, and revenue metrics.

#### Implementation Steps
1. **Reference Polar's Analytics**
   - Study: Polar's analytics queries and aggregations
   - Document: SQL patterns, date range handling

2. **Generate NestJS Module**
   ```bash
   cd apps/api
   nest g module analytics
   nest g service analytics
   nest g controller analytics
   ```

3. **Create DTOs** (`src/analytics/dto/`)
   - `analytics-query.dto.ts` - date range, granularity (day/week/month)

4. **Implement Service** (`src/analytics/analytics.service.ts`)
   ```typescript
   // Key methods:
   - async getMRR(organizationId: string, dateRange: DateRange)
     // SELECT SUM(amount) FROM subscriptions
     // WHERE status = 'active' AND organization_id = ?
     // GROUP BY period

   - async getActiveSubscriptionsCount(organizationId: string)
     // COUNT active subscriptions

   - async getChurnRate(organizationId: string, period: string)
     // (Cancelled subs / Total subs at period start) * 100

   - async getRevenueTrend(organizationId: string, dateRange: DateRange)
     // Aggregate revenue by day/week/month

   - async getSubscriptionGrowth(organizationId: string, dateRange: DateRange)
     // Track new vs cancelled subscriptions over time

   - async getTopCustomers(organizationId: string, limit: number)
     // Customers with highest LTV
   ```

5. **Create Controller Endpoints**
   ```typescript
   @UseGuards(JwtAuthGuard)
   @Controller('analytics')

   GET /analytics/mrr                    - Monthly recurring revenue
   GET /analytics/subscriptions/active   - Active subscriptions count
   GET /analytics/churn-rate             - Churn rate for period
   GET /analytics/revenue/trend          - Revenue over time
   GET /analytics/subscriptions/growth   - Subscription growth
   GET /analytics/customers/top          - Top customers by revenue
   ```

6. **Optimize Queries**
   - Add database indexes:
     ```sql
     CREATE INDEX idx_subscriptions_status ON subscriptions(status);
     CREATE INDEX idx_subscriptions_org_created ON subscriptions(organization_id, created_at);
     CREATE INDEX idx_subscriptions_org_status ON subscriptions(organization_id, status);
     ```

7. **Add Caching** (Optional for Week 1, Required for Week 2)
   - Cache analytics results for 5-15 minutes
   - Invalidate on subscription changes

#### Files to Create
- `apps/api/src/analytics/analytics.module.ts`
- `apps/api/src/analytics/analytics.service.ts`
- `apps/api/src/analytics/analytics.controller.ts`
- `apps/api/src/analytics/dto/analytics-query.dto.ts`

#### Testing Checklist
- [ ] MRR calculation is accurate
- [ ] Active subscriptions count matches database
- [ ] Churn rate formula is correct
- [ ] Date range filtering works
- [ ] Performance is acceptable (queries < 500ms)
- [ ] Org isolation enforced

---

### Task 3: Fix OrganizationId Hardcoding ⭐ CRITICAL
**Estimated Time:** 1-2 hours
**Dependencies:** None
**Blocks:** Products page functionality

#### Description
Remove `organizationId="temp-org-id"` placeholder and implement proper organization context.

#### Implementation Steps
1. **Locate Hardcoded Value**
   - File: `apps/web/src/app/dashboard/[organization]/products/page.tsx:36`
   - Current: `<ProductsPage organizationId="temp-org-id" />`

2. **Get Organization from Route Params**
   ```typescript
   // In page.tsx (Server Component)
   export default async function ProductsPageRoute({
     params,
   }: {
     params: { organization: string };
   }) {
     const organizationId = params.organization;

     return <ProductsPage organizationId={organizationId} />;
   }
   ```

3. **Verify Organization Ownership**
   - Add middleware check or server-side validation
   - Ensure user belongs to organization before rendering

4. **Update All Similar Pages**
   - Check: NewProductPage, BenefitsPage, etc.
   - Ensure consistent pattern across all org-scoped pages

5. **Test**
   - Navigate to `/dashboard/[org-id]/products`
   - Verify products are filtered by organization
   - Test with multiple organizations

#### Files to Modify
- `apps/web/src/app/dashboard/[organization]/products/page.tsx`
- Any other pages with hardcoded org IDs

#### Testing Checklist
- [ ] Organization ID correctly extracted from route
- [ ] Products filtered by organization
- [ ] User can't access other orgs' data
- [ ] Works with organization switcher

---

## Week 2: Integration & Testing (Days 6-10)

### Task 4: Complete TODOs in Features Module
**Estimated Time:** 4-6 hours
**Dependencies:** Task 3 complete

#### Description
Implement SDK auth guards and Redis caching for feature access checks.

#### Implementation Steps
1. **Find All TODOs**
   ```bash
   cd apps/api
   grep -r "TODO" src/features/
   ```

2. **Implement SDK Auth Guards**
   - Create API key authentication for SDK calls
   - Location: `src/features/features.controller.ts` (checkAccess endpoint)
   - Pattern: Header-based API key validation
   ```typescript
   // New guard: ApiKeyGuard
   @UseGuards(ApiKeyGuard)
   @Post('check-access')
   async checkAccess(@ApiKey() organizationId: string, @Body() dto)
   ```

3. **Add Redis Caching**
   - Install: `npm install @nestjs/cache-manager cache-manager redis`
   - Cache feature access results (TTL: 5 minutes)
   - Cache usage quota checks (TTL: 1 minute)
   - Invalidate on feature grant changes

4. **Setup Redis Module**
   ```typescript
   // app.module.ts
   CacheModule.register({
     isGlobal: true,
     store: redisStore,
     host: 'localhost',
     port: 6379,
   })
   ```

5. **Apply Caching to Service Methods**
   ```typescript
   // features.service.ts
   @Cacheable('feature-access', { ttl: 300 })
   async checkAccess(customerId: string, featureKey: string)

   @Cacheable('usage-quota', { ttl: 60 })
   async getUsage(customerId: string, featureKey: string)
   ```

#### Files to Create/Modify
- `apps/api/src/auth/guards/api-key.guard.ts` (new)
- `apps/api/src/auth/decorators/api-key.decorator.ts` (new)
- `apps/api/src/features/features.service.ts` (modify - add caching)
- `apps/api/src/app.module.ts` (modify - add CacheModule)

#### Testing Checklist
- [ ] SDK API key authentication works
- [ ] Invalid API keys rejected
- [ ] Feature access cached correctly
- [ ] Cache invalidates on grant changes
- [ ] Performance improved (< 50ms for cached responses)

---

### Task 5: Integration Testing Suite
**Estimated Time:** 6-8 hours
**Dependencies:** All APIs complete

#### Description
End-to-end testing of the complete subscription flow.

#### Test Scenarios
1. **Product → Subscription Flow**
   - Create product with features
   - Create customer
   - Create subscription
   - Verify feature grants created
   - Check feature access via API

2. **Feature Access & Usage Tracking**
   - checkAccess returns correct boolean
   - trackUsage increments counter
   - Quota limits enforced
   - Usage resets on billing cycle

3. **Webhook Replay Testing**
   - Simulate Stripe webhook events
   - Verify idempotency (duplicate events ignored)
   - Check database state after each event

4. **Cancellation Flow**
   - Cancel subscription
   - Verify feature grants revoked
   - Check access denied
   - Ensure data cleanup

#### Implementation
```typescript
// apps/api/test/integration/subscription-flow.spec.ts
describe('Subscription Flow Integration', () => {
  it('should complete full subscription lifecycle', async () => {
    // 1. Create product
    // 2. Create customer
    // 3. Create subscription
    // 4. Verify grants
    // 5. Check access
    // 6. Track usage
    // 7. Cancel subscription
    // 8. Verify access revoked
  });
});
```

#### Files to Create
- `apps/api/test/integration/subscription-flow.spec.ts`
- `apps/api/test/integration/feature-access.spec.ts`
- `apps/api/test/integration/webhooks.spec.ts`

#### Testing Checklist
- [ ] All integration tests pass
- [ ] Edge cases covered (expired cards, failed payments)
- [ ] Concurrent request handling tested
- [ ] Database rollback on errors

---

### Task 6: Performance Optimization
**Estimated Time:** 4-6 hours
**Dependencies:** Task 5 complete

#### Description
Add database indexes and implement Redis caching where marked TODO.

#### Implementation Steps
1. **Analyze Slow Queries**
   - Enable query logging in PostgreSQL
   - Identify queries > 100ms
   - Run EXPLAIN ANALYZE on slow queries

2. **Add Database Indexes**
   ```sql
   -- Subscriptions
   CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
   CREATE INDEX idx_subscriptions_org_status ON subscriptions(organization_id, status);
   CREATE INDEX idx_subscriptions_status_next_billing ON subscriptions(status, next_billing_date);

   -- Feature Grants
   CREATE INDEX idx_feature_grants_customer ON feature_grants(customer_id);
   CREATE INDEX idx_feature_grants_customer_feature ON feature_grants(customer_id, feature_id);

   -- Usage Records
   CREATE INDEX idx_usage_records_customer_feature ON usage_records(customer_id, feature_id);
   CREATE INDEX idx_usage_records_period ON usage_records(period_start, period_end);

   -- Customers
   CREATE INDEX idx_customers_org ON customers(organization_id);
   CREATE INDEX idx_customers_email ON customers(email);
   CREATE INDEX idx_customers_stripe ON customers(stripe_customer_id);
   ```

3. **Create Migration**
   ```bash
   cd supabase
   supabase migration new add_performance_indexes
   # Edit the generated file with above SQL
   ```

4. **Implement Redis Caching**
   - Cache product listings (TTL: 10 minutes)
   - Cache feature access (TTL: 5 minutes)
   - Cache analytics (TTL: 15 minutes)

5. **Add Query Result Caching**
   - Use `@Cacheable()` decorator on expensive queries
   - Implement cache invalidation strategy

6. **Benchmark Performance**
   - Before: Measure response times
   - After: Verify improvement (target: 80% reduction for cached queries)

#### Files to Create
- `supabase/migrations/YYYYMMDDHHMMSS_add_performance_indexes.sql`

#### Testing Checklist
- [ ] All queries < 100ms
- [ ] Cached endpoints < 50ms
- [ ] Indexes applied successfully
- [ ] No N+1 query issues
- [ ] Load testing passes (100 concurrent requests)

---

## Week 3: Production Readiness (Days 11-15)

### Task 7: Error Handling & Validation
**Estimated Time:** 4-6 hours
**Dependencies:** All features complete

#### Description
Standardize error responses and add comprehensive input validation.

#### Implementation Steps
1. **Create Global Exception Filter**
   ```typescript
   // src/common/filters/http-exception.filter.ts
   @Catch()
   export class GlobalExceptionFilter implements ExceptionFilter {
     catch(exception: unknown, host: ArgumentsHost) {
       // Standardize error format
       // Log errors
       // Return consistent JSON structure
     }
   }
   ```

2. **Standardize Error Responses**
   ```json
   {
     "statusCode": 400,
     "message": "Validation failed",
     "errors": [
       { "field": "email", "message": "Invalid email format" }
     ],
     "timestamp": "2026-01-22T10:00:00Z",
     "path": "/api/customers"
   }
   ```

3. **Add Input Validation**
   - Enhance all DTOs with class-validator decorators
   - Email validation, string lengths, number ranges
   - Custom validators for business logic

4. **Handle Stripe API Errors**
   ```typescript
   try {
     await stripe.customers.create();
   } catch (error) {
     if (error.type === 'StripeCardError') {
       throw new BadRequestException('Card declined');
     }
     // Map all Stripe error types to HTTP exceptions
   }
   ```

5. **Add Request Logging**
   - Log all API requests with user context
   - Track error rates
   - Monitor slow requests

#### Files to Create/Modify
- `apps/api/src/common/filters/http-exception.filter.ts` (new)
- `apps/api/src/main.ts` (modify - register filter)
- All DTO files (enhance validation)

#### Testing Checklist
- [ ] All validation errors return 400 with details
- [ ] Stripe errors handled gracefully
- [ ] 500 errors logged but don't expose internals
- [ ] Request/response logged for debugging

---

### Task 8: Documentation
**Estimated Time:** 3-4 hours
**Dependencies:** All tasks complete

#### Description
Create comprehensive API documentation and deployment guide.

#### Deliverables
1. **API Endpoint Reference** (`docs/api/endpoints.md`)
   - All endpoints with request/response examples
   - Authentication requirements
   - Rate limits
   - Error codes

2. **Error Codes Reference** (`docs/api/errors.md`)
   - All possible error codes
   - Causes and solutions
   - Example error responses

3. **Deployment Guide** (`docs/deployment/production.md`)
   - Environment variables checklist
   - Database migration steps
   - Stripe webhook setup
   - Redis configuration
   - Health check endpoints

4. **Developer Runbook** (`docs/operations/runbook.md`)
   - Common issues and fixes
   - Monitoring setup
   - Alerting configuration
   - Rollback procedures

#### Files to Create
- `docs/api/endpoints.md`
- `docs/api/errors.md`
- `docs/deployment/production.md`
- `docs/operations/runbook.md`

---

## Daily Checklist

### Every Morning
- [ ] Pull latest changes from main
- [ ] Check for blockers from other team members
- [ ] Update progress in `docs/sprint-beta-launch/ankush-progress.md`
- [ ] Review overnight errors in logs

### Every Evening
- [ ] Commit and push work
- [ ] Update progress document
- [ ] Note any blockers for standup
- [ ] Review PRs from team members

### Handoff Points
- **Day 2:** Customers API ready → Notify Aakash
- **Day 3:** Analytics API ready → Notify Aakash
- **Day 1:** Subscriptions hooks verified → Notify Abdul
- **Week 2:** Integration tests passing → Notify all team

---

## Tools & Resources

### Reference Material
- Polar repo: `/Users/ankushkumar/Code/payment/billingos`
- Stripe API docs: https://stripe.com/docs/api
- NestJS docs: https://docs.nestjs.com

### Development Tools
- Postman collection for API testing
- Stripe CLI for webhook testing
- Redis Commander for cache inspection

### Code Quality
- ESLint and Prettier configured
- Pre-commit hooks enabled
- TypeScript strict mode

---

**Created:** January 22, 2026
**Assigned To:** Ankush
**Estimated Total Hours:** 35-45 hours
**Status:** Ready to Start
