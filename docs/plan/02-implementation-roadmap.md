# BillingOS Implementation Roadmap

**Date:** January 3, 2026
**Timeline:** 3 weeks to MVP
**Team:** 4 developers (1 full stack, 3 frontend engineers)
**Strategy:** Independent parallel tasks (minimal dependencies)

---

## Team Roles & Expertise

| Developer | Expertise | Primary Focus |
|-----------|-----------|---------------|
| **Ankush** | Full Stack (BE/FE/DB/Infrastructure) | Core backend, complex logic, infrastructure, AI layer |
| **Aakash (FE1)** | Frontend (Strong FE/TS/JS, Limited BE) | Merchant Dashboard lead, analytics UI, React Query |
| **Rames (FE2)** | Frontend (Strong FE/TS/JS, Limited BE) | SDK package, Customer Portal, OpenAPI integration |
| **Abdul (FE3)** | Frontend (FE/TS/JS) | Dashboard components, alerts UI, testing, integration work |

---

## Week 1: Foundation Layer

### Day 1 (Monday): Setup & Unblocking

**Goal:** Unblock all developers for parallel work

#### Ankush (Full Stack) - Day 1 ONLY
**Task:** Create complete database schema + infrastructure

**Deliverables:**
1. All database migrations:
   - `merchants` table
   - `customers` table
   - `subscriptions` table
   - `entitlements` table
   - `usage_records` table
   - `webhook_events` table (already exists, enhance)
   - `ai_insights` table

2. Regenerate TypeScript types:
   ```bash
   supabase gen types typescript --local > packages/shared/types/database.ts
   ```

3. Create `.env.example` for all apps with new variables

4. Set up BullMQ queue infrastructure (for webhooks)

5. Set up Redis connection (Upstash or local)

**End of Day 1:** Everyone has:
- ✅ Database schema
- ✅ TypeScript types
- ✅ Environment setup guide
- ✅ Queue infrastructure

---

### Days 2-5 (Tuesday-Friday): Independent Parallel Work

#### Ankush (Full Stack) - Days 2-5
**Focus:** Core backend APIs + Stripe integration (most complex work)

**Tasks (No dependencies on others):**

**1. Customer Module (Backend)**
- `POST /api/customers` - Create customer in Stripe + DB
- `GET /api/customers/:id` - Get customer
- `GET /api/customers` - List customers (paginated)
- Dual-write pattern (Stripe first, then DB)

**2. Subscription Module (Backend)**
- `POST /api/subscriptions` - Create subscription
  - Write to Stripe Connect account
  - Cache in PostgreSQL
  - Grant entitlements
- `GET /api/subscriptions/:id` - Get subscription (from cache)
- `POST /api/subscriptions/:id/cancel` - Cancel subscription
- Implement dual-write + cache invalidation

**3. Webhook Handler Enhancement**
- Extend existing webhook service (`stripe-webhook.service.ts`)
- Handle `customer.subscription.*` events
- Handle `invoice.payment_*` events
- Handle `entitlements.active_entitlement_summary.updated`
- Update PostgreSQL on webhook
- Invalidate Redis cache

**4. Entitlement Service**
- `GET /api/entitlements/check` - Check if customer has feature (Redis → DB → Stripe)
- Auto-grant entitlements when subscription created
- Auto-revoke when subscription canceled
- Cache in Redis with TTL

**5. Usage Tracking (Backend)**
- `POST /api/usage/track` - Send event to Stripe Meter API
- Batch events (queue-based)
- Store in `usage_records` table (aggregated)

**Tools:** NestJS, Stripe SDK, PostgreSQL, Redis, BullMQ

**Files to Create:**
```
apps/api/src/
├── customer/
│   ├── customer.module.ts
│   ├── customer.service.ts
│   ├── customer.controller.ts
│   └── dto/create-customer.dto.ts
├── subscription/
│   ├── subscription.module.ts
│   ├── subscription.service.ts
│   ├── subscription.controller.ts
│   └── dto/create-subscription.dto.ts
├── entitlement/
│   ├── entitlement.module.ts
│   ├── entitlement.service.ts
│   └── entitlement.controller.ts
└── usage/
    ├── usage.module.ts
    ├── usage.service.ts
    └── usage.controller.ts
```

---

#### Aakash (FE1) - Days 2-5
**Focus:** Merchant Dashboard UI + Simple Backend APIs

**Tasks (No dependencies on Ankush, Rames, or Abdul):**

**1. Merchant Dashboard - Frontend (Next.js)**

Create dashboard at `apps/web/src/app/dashboard/[organization]/`:

Pages to build:
- `customers/page.tsx` - Customer list with search/filter
- `subscriptions/page.tsx` - Active subscriptions overview
- `analytics/page.tsx` - Revenue charts (MRR, churn - use mock data initially)
- `insights/page.tsx` - AI insights list (use mock data initially)

**Components to build:**
- `CustomerTable.tsx` - Sortable table
- `SubscriptionCard.tsx` - Subscription details card
- `RevenueChart.tsx` - Line chart (use Recharts)
- `InsightCard.tsx` - AI insight display

**2. Data Fetching Hooks (React Query)**

Create in `apps/web/src/hooks/queries/`:
- `useCustomers.ts` - Fetch customer list
- `useSubscriptions.ts` - Fetch subscriptions
- `useInsights.ts` - Fetch AI insights (mock for now)

**3. Simple Backend: Read-Only Endpoints (NestJS)**

You can write simple GET endpoints without blocking others:

- `GET /api/analytics/mrr` - Calculate MRR from DB
  ```typescript
  // Simple SQL query on subscriptions table
  SELECT DATE_TRUNC('month', created_at) as month,
         SUM(amount) as mrr
  FROM subscriptions
  WHERE status = 'active'
  GROUP BY month;
  ```

- `GET /api/analytics/churn-rate` - Calculate churn rate
- `GET /api/insights` - List AI insights from DB

**Tools:** Next.js, React, TailwindCSS, Recharts, React Query, NestJS (simple endpoints)

**Files to Create:**
```
apps/web/src/
├── app/dashboard/[organization]/
│   ├── customers/page.tsx
│   ├── subscriptions/page.tsx
│   ├── analytics/page.tsx
│   └── insights/page.tsx
├── components/dashboard/
│   ├── CustomerTable.tsx
│   ├── SubscriptionCard.tsx
│   ├── RevenueChart.tsx
│   └── InsightCard.tsx
└── hooks/queries/
    ├── useCustomers.ts
    ├── useSubscriptions.ts
    └── useInsights.ts

apps/api/src/analytics/
├── analytics.module.ts
├── analytics.service.ts
└── analytics.controller.ts
```

**No blockers:** Use TypeScript types from Day 1, build UI independently, connect to APIs later

---

#### Rames (FE2) - Days 2-5
**Focus:** SDK Package + Customer Portal UI

**Tasks (No dependencies on others):**

**1. SDK Package Structure (`packages/sdk/`)**

Create new package:
```bash
mkdir -p packages/sdk
cd packages/sdk
npm init -y
```

Setup:
- TypeScript config
- Build script (tsup or esbuild)
- Package.json with exports

**2. SDK Core Structure**

```typescript
// packages/sdk/src/index.ts
export class BillingOS {
  constructor(options: BillingOSOptions) {
    // Initialize with access token
  }

  // Methods (can mock API calls initially)
  async hasFeature(customerId: string, feature: string): Promise<boolean> {
    // Will call GET /api/entitlements/check
    // For now, return mock data
  }

  async trackUsage(customerId: string, metric: string, value: number) {
    // Will call POST /api/usage/track
    // For now, log to console
  }

  async getSubscription(customerId: string) {
    // Will call GET /api/subscriptions
    // For now, return mock subscription
  }
}
```

**3. OpenAPI Spec Setup (NestJS)**

Add Swagger to backend:
```typescript
// apps/api/src/main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('BillingOS API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api-docs', app, document);
```

**4. Customer Portal UI (Next.js)**

Create new app or pages in `apps/web/`:
- `portal/subscription/page.tsx` - View current subscription
- `portal/invoices/page.tsx` - Invoice history
- `portal/payment-method/page.tsx` - Update payment method

**Components:**
- `SubscriptionDetails.tsx` - Current plan, billing date
- `InvoiceList.tsx` - Past invoices table
- `PaymentMethodForm.tsx` - Update card (Stripe Elements)

**Tools:** TypeScript, Node.js, Next.js, Stripe Elements

**Files to Create:**
```
packages/sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── client.ts
│   └── types.ts
└── README.md

apps/web/src/app/portal/
├── subscription/page.tsx
├── invoices/page.tsx
└── payment-method/page.tsx
```

**No blockers:** Build SDK structure with mocks, connect to real APIs in Week 2

---

#### Abdul (FE3) - Days 2-5
**Focus:** Dashboard Components + Alerts UI + Testing

**Tasks (Working alongside Aakash on dashboard):**

**1. Reusable UI Components**

Create in `apps/web/src/components/dashboard/`:
- `LoadingSkeleton.tsx` - Loading states for tables/cards
- `EmptyState.tsx` - "No data yet" states
- `StatusBadge.tsx` - Subscription status badges (active, past_due, canceled)
- `MetricCard.tsx` - Revenue metric cards (MRR, Churn, etc.)

**Components:**
```typescript
// StatusBadge.tsx
interface StatusBadgeProps {
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  // Color coding based on status
}
```

**2. Alerts & Notifications UI**

Create alerts feature in `apps/web/src/app/dashboard/[organization]/alerts/`:
- `page.tsx` - Alerts list page
- `AlertCard.tsx` - Individual alert display
- `AlertNotificationBell.tsx` - Header notification bell with badge

**Alert Types:**
- Churn risk alerts
- Payment failure alerts
- Usage limit warnings
- Upgrade opportunities

**3. Insights Dashboard Section**

Create in `apps/web/src/app/dashboard/[organization]/insights/`:
- `page.tsx` - AI insights page
- `InsightCard.tsx` - Display AI-generated insights
- `InsightActions.tsx` - "Dismiss" or "Take Action" buttons

**4. Testing & Quality Assurance**

Create test utilities in `apps/web/src/test/`:
- `mockData.ts` - Mock customer/subscription data for UI testing
- `testHelpers.ts` - Common test utilities
- Integration testing for dashboard pages

**Manual Testing:**
- Create test checklist in `docs/testing/dashboard-qa.md`
- Test all dashboard pages with mock data
- Document bugs in GitHub issues

**5. Dashboard Polish**

Work with Aakash to add:
- Error boundaries for components
- Loading states for all data fetching
- Responsive design fixes (mobile-friendly)
- Dark mode support (if time permits)

**Tools:** Next.js, React, TypeScript, TailwindCSS, Radix UI

**Files to Create:**
```
apps/web/src/
├── components/dashboard/
│   ├── LoadingSkeleton.tsx
│   ├── EmptyState.tsx
│   ├── StatusBadge.tsx
│   ├── MetricCard.tsx
│   └── AlertNotificationBell.tsx
├── app/dashboard/[organization]/
│   ├── alerts/
│   │   ├── page.tsx
│   │   └── AlertCard.tsx
│   └── insights/
│       ├── page.tsx
│       ├── InsightCard.tsx
│       └── InsightActions.tsx
└── test/
    ├── mockData.ts
    └── testHelpers.ts

docs/testing/
└── dashboard-qa.md
```

**Collaboration with Aakash:**
- Aakash builds main dashboard pages
- Abdul builds reusable components for those pages
- Both integrate components together
- Abdul focuses on polish & testing

**No blockers:** Can build components independently with mock data

---

### Week 1 End-of-Week Review (Friday)

**Team Sync Meeting:**
- Demo what each person built
- Test integrations (SDK → API → DB)
- Identify any blockers for Week 2

**Expected Deliverables:**
- ✅ Database schema (Ankush)
- ✅ Core APIs working (Ankush)
- ✅ Merchant dashboard UI pages (Aakash)
- ✅ Dashboard components (Abdul)
- ✅ Alerts & insights UI (Abdul)
- ✅ SDK package structure (Rames)
- ✅ Customer portal UI (Rames)

---

## Week 2: Intelligence Layer + Integrations

### Task Allocation (Adjusted for Dependencies)

#### Ankush (Full Stack) - Week 2
**Focus:** AI/ML features + Complex integrations

**1. Churn Prediction Engine**
- Daily cron job to analyze usage patterns
- ML model (simple logistic regression to start)
- Store predictions in `ai_insights` table
- Create alert when churn risk >70%

**2. Smart Upgrade Nudge System**
- Detect when customer hits 90% of plan limit
- Generate personalized upgrade recommendation
- Store in `ai_insights` table with suggested plan

**3. Reconciliation Job**
- Hourly cron: Compare Stripe vs PostgreSQL
- Fix discrepancies (Stripe wins)
- Alert on Slack if >10 discrepancies

**4. Webhook Processor Optimization**
- Move to BullMQ queue (async processing)
- Add retry logic for failed webhooks
- Implement exponential backoff

**Tools:** Node.js, BullMQ, Simple ML library (regression-js)

---

#### Aakash (FE1) - Week 2
**Focus:** Connect dashboard UI to real APIs + Analytics

**1. Connect Dashboard to Backend APIs**
- Replace mock data with React Query hooks
- Call APIs built by Ankush in Week 1
- Handle loading/error states

**2. Revenue Analytics Dashboard**
- MRR chart (line chart from `/api/analytics/mrr`)
- Churn rate display
- Active subscribers count
- Top customers by revenue

**3. AI Insights Display**
- Fetch from `/api/insights`
- Display churn risk alerts
- Show upgrade opportunities
- Add "Dismiss" and "Act" buttons

**4. Integrate Abdul's Components**
- Use Abdul's StatusBadge, MetricCard components
- Integrate AlertNotificationBell in header
- Connect to insights page built by Abdul

**Tools:** Next.js, React Query, Recharts

---

#### Rames (FE2) - Week 2
**Focus:** Connect SDK to real APIs + Customer portal backend

**1. SDK: Connect to Real APIs**
- Replace mocks with actual HTTP calls
- Add authentication (Bearer token)
- Add error handling
- Write unit tests

**2. Customer Portal Backend Endpoints**
- `GET /api/portal/subscription` - Get customer's subscription
- `GET /api/portal/invoices` - List invoices
- `POST /api/portal/payment-method` - Update payment method (Stripe)

**3. Connect Customer Portal UI**
- Wire up portal pages to backend
- Integrate Stripe Elements for payment updates
- Handle success/error flows

**Tools:** TypeScript, Axios/Fetch, Stripe Elements, NestJS

---

#### Abdul (FE3) - Week 2
**Focus:** Dashboard features + Integration testing

**1. Complete Alerts System**
- Real-time alert updates (polling every 30s)
- Alert filtering (by type, status)
- Mark alerts as read/dismissed
- Alert action buttons (contact customer, send email)

**2. Insights Dashboard Features**
- Insights filtering (churn risk, upgrade opportunity)
- Insights timeline view
- Export insights to CSV
- Insights summary cards

**3. Dashboard Navigation & Layout**
- Build main navigation menu
- Add breadcrumbs
- Create responsive sidebar
- Add user profile dropdown

**4. Integration Testing & QA**
- Test complete user flows
- Document bugs in GitHub issues
- Create test data for various scenarios
- Write end-to-end test scenarios in `docs/testing/e2e-scenarios.md`

**5. Developer Documentation**
- Component usage guide (`docs/components/usage.md`)
- Dashboard architecture doc (`docs/dashboard/architecture.md`)
- Contributing guide for new components

**Tools:** Next.js, React, TypeScript, Markdown

---

### Week 2 End-of-Week Review (Friday)

**Team Sync:**
- Demo AI features (churn prediction, upgrade nudges)
- Test full flow: SDK → API → Stripe → Webhooks → Cache
- Load testing (simulate 100 customers)

**Expected Deliverables:**
- ✅ AI insights working (Ankush)
- ✅ Dashboard showing real data (Aakash)
- ✅ Alerts & insights features complete (Abdul)
- ✅ SDK connected to APIs (Rames)
- ✅ Customer portal working (Rames)

---

## Week 3: Polish + Launch Prep

### Task Allocation (Launch Focus)

#### Ankush (Full Stack) - Week 3
**Focus:** Production readiness + Deployment

**1. Dunning & Retention Workflows**
- Webhook: `invoice.payment_failed` → retry logic
- Auto-retry 3x over 10 days
- Send alert to merchant
- If all retries fail → create cancellation survey

**2. Production Infrastructure**
- Set up Railway/Render deployment
- Configure production environment variables
- Set up Sentry error tracking
- Configure Stripe production webhooks

**3. Performance Optimization**
- Add database indexes
- Optimize slow queries
- Set up Redis cache warming (preload common data)
- Load testing with k6

**4. Security Audit**
- Review all API endpoints (auth required?)
- Check for SQL injection vulnerabilities
- Test rate limiting
- Review CORS configuration

---

#### Aakash (FE1) - Week 3
**Focus:** Merchant dashboard polish + Onboarding

**1. Dashboard Polish**
- Add loading skeletons (use Abdul's components)
- Improve error messages
- Add empty states ("No customers yet")
- Responsive design (mobile-friendly)

**2. Onboarding Flow**
- Welcome page after signup
- "Create your first customer" tutorial
- "Install SDK" code snippet
- "Test mode" banner

**3. Analytics Enhancements**
- Add date range picker for analytics
- Export analytics to CSV
- Add comparison view (this month vs last month)
- Add filters for customer segments

**4. Final Testing**
- Test all dashboard flows
- Cross-browser testing (Chrome, Safari, Firefox)
- Mobile responsiveness check

**Tools:** Next.js, React, TailwindCSS

---

#### Rames (FE2) - Week 3
**Focus:** SDK polish + Customer portal polish

**1. SDK: Production Ready**
- Add TypeScript strict mode
- Write comprehensive JSDoc comments
- Create SDK documentation website (simple Next.js site)
- Publish to NPM as `@billingos/sdk@0.1.0`

**2. SDK Documentation Website**
Create `apps/sdk-docs/` (simple Next.js app):
- Getting started guide
- API reference (all methods)
- Code examples
- Troubleshooting

**3. Customer Portal Polish**
- Add loading states
- Improve error handling
- Add "Contact support" button
- Mobile responsive

---

#### Abdul (FE3) - Week 3
**Focus:** Final polish + Launch materials + Documentation

**1. Dashboard Final Polish**
- Dark mode implementation (if not done)
- Accessibility improvements (ARIA labels, keyboard navigation)
- Add tooltips for all actions
- Polish all animations and transitions

**2. Launch Materials**
Write in `docs/launch/`:
- `blog-post.md` - Announcement post for launch
- `demo-script.md` - 3-minute product demo script
- `feature-highlights.md` - Bullet points for marketing

**3. README.md Updates**
Update root `README.md`:
- Project description
- Features list
- Quick start guide
- Links to docs

**4. Support Documentation**
Create `docs/support/`:
- `faq.md` - Frequently asked questions
- `troubleshooting.md` - Common issues & solutions
- `api-errors.md` - Error code reference

**5. Component Library Documentation**
Create `docs/components/`:
- Document all reusable components built
- Usage examples for each component
- Props API reference
- Theming guide

**6. Social Media Assets**
Create text files for launch posts:
- `twitter-launch.md` - Tweet thread
- `linkedin-launch.md` - LinkedIn post

**Tools:** Next.js, React, Markdown

---

### Week 3 End-of-Week: LAUNCH 🚀

**Final Checklist:**
- [ ] All tests passing
- [ ] Production deployment successful
- [ ] Stripe production webhooks configured
- [ ] SDK published to NPM
- [ ] Documentation complete
- [ ] Demo video recorded
- [ ] Launch blog post ready
- [ ] Social media posts scheduled

**Launch Day Tasks:**
- Deploy to production
- Publish NPM package
- Post on Twitter, LinkedIn, ProductHunt
- Email early access list
- Monitor for errors (Sentry)

---

## Summary: Independent Task Strategy

### Key Principles We Followed:

**1. Day 1 Unblocking (Ankush)**
- Create all shared infrastructure (DB, types, env)
- Everyone can start working on Day 2

**2. Independent Streams (Days 2-5)**
- Ankush: Backend APIs (complex work, no dependencies)
- Aakash: Dashboard pages & analytics (use types, build UI)
- Rames: SDK + Portal UI (mock data initially)
- Abdul: Dashboard components & features (builds alongside Aakash)

**3. Integration Points**
- End of Week 1: Wire up SDK → API → DB
- End of Week 2: Wire up AI insights → Dashboard
- Week 3: Polish everything

**4. Minimal Dependencies**
- Each person can work in isolation most of the time
- Aakash & Abdul collaborate on dashboard (complementary work)
- Integration happens at weekly sync meetings
- No blocking dependencies

---

## Daily Standups (15 minutes)

**Format:**
1. What did you complete yesterday?
2. What are you working on today?
3. Any blockers?

**Goal:** Catch integration issues early, unblock quickly

---

**Read Next:**
- `03-migration-strategy.md` - Future migration plan
- `04-next-steps.md` - Start immediately
