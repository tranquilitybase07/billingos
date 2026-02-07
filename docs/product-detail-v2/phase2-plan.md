# Product Detail Page - Phase 2 Plan

## Overview

This document outlines the advanced features and missing functionality to be implemented in Phase 2 of the Product Detail Page enhancement project.

**Phase 1 Completed:**
- Active subscriptions count display
- Full edit functionality for prices (create new, archive old - Stripe best practice)
- Full edit functionality for features (link, unlink, update config)
- Atomic operations with Stripe sync
- Improved UI indicators and warnings

---

## Phase 2: Advanced Features & Missing Functionality

### 1. Implement Full Metrics Tab

**Current State:**
- Metrics tab exists but shows placeholder content
- No analytics data displayed

**Goal:**
Provide comprehensive product-level analytics to help organizations understand product performance.

**Features to Implement:**

#### Revenue Metrics
- **MRR (Monthly Recurring Revenue)** by product
  - Calculate from active subscriptions
  - Show trend graph (last 12 months)
  - Compare to previous period
- **ARR (Annual Recurring Revenue)** by product
  - Calculated as MRR × 12
  - Useful for annual planning
- **Total Revenue** (lifetime)
  - Sum of all successful charges for this product
  - Include one-time and recurring

#### Subscription Growth
- **New subscriptions** chart (daily/weekly/monthly)
- **Churn rate** calculation
  - (Canceled subscriptions / Total active) × 100
  - Track over time
- **Net growth** (new - churned)
- **Retention rate** by cohort

#### Conversion Metrics
- **Trial-to-paid conversion rate**
  - Percentage of trials that convert to paid
  - Average time to conversion
- **Checkout abandonment rate**
  - Started checkout but didn't complete
  - Requires checkout analytics integration

#### Churn Analysis
- **Cancellation reasons** (if collected)
- **Average customer lifetime** for this product
- **Churn by subscription length** (early vs late churn)
- **Win-back rate** (customers who re-subscribed)

**Implementation:**
- Create new backend endpoints:
  - `GET /api/products/:id/metrics/revenue`
  - `GET /api/products/:id/metrics/subscriptions`
  - `GET /api/products/:id/metrics/conversions`
  - `GET /api/products/:id/metrics/churn`
- Create analytics service to calculate metrics
- Build interactive charts using Recharts or similar
- Cache metrics for performance (update daily)

---

### 2. Product Analytics Dashboard

**Goal:**
Deep insights into customer behavior and product tier performance.

**Features to Implement:**

#### Customer Lifecycle by Product Tier
- **Segment customers** by product (Starter, Pro, Enterprise)
- **Lifecycle stages:**
  - Trial
  - Active
  - Past due
  - Canceled
  - Re-activated
- **Flow visualization** (Sankey diagram showing progression)

#### Feature Usage Correlation
- **Track which features** are used most by product tier
  - Requires feature usage tracking (metering)
  - Identify if customers are using entitled features
- **Underutilized features** by tier
  - Features available but not used
  - Opportunity for customer education
- **Over-limit usage** detection
  - Customers hitting limits
  - Upgrade nudge opportunities

#### Upgrade/Downgrade Patterns
- **Upgrade rate** by tier
  - Percentage of customers upgrading
  - Time to upgrade (from signup)
- **Downgrade rate** by tier
  - Reasons for downgrade (if collected)
  - Features that triggered downgrade
- **Upgrade paths** visualization
  - Most common tier transitions
  - Revenue impact of upgrades

#### Retention Cohorts by Product
- **Cohort analysis** (month 1, 3, 6, 12 retention)
- **Compare retention** across product tiers
- **Identify high-value cohorts**
  - Which acquisition sources/periods have best retention

**Implementation:**
- Create dedicated analytics module in backend
- Build data warehouse/aggregation tables for performance
- Create interactive dashboard with filters (date range, tier, cohort)
- Use visualization library for complex charts

---

### 3. Complete Checkout Integration

**Goal:**
Make it easy for organizations to integrate product checkout into their applications.

**Features to Implement:**

#### Embedded Checkout Modal (SDK)
- JavaScript SDK for embedding checkout
- Modal/popup overlay on merchant's site
- Pre-filled with product, prices, customer data
- Customizable branding (colors, logo)
- Responsive design

**Usage:**
```javascript
BillingOS.checkout({
  productId: 'prod_xxx',
  priceId: 'price_xxx',
  customer: { email: 'user@example.com' },
  successUrl: '/success',
  cancelUrl: '/cancel'
});
```

#### Checkout Link Generation
- **Shareable checkout links** for products
- No-code option for non-technical users
- Pre-configure:
  - Product + price
  - Trial length override
  - Coupon codes
  - Custom success/cancel URLs
- Track link performance (views, conversions)

**Implementation:**
- Build checkout links table in database
- Create endpoint: `POST /api/products/:id/checkout-links`
- Generate unique short URLs
- Track analytics (clicks, conversions)

#### Custom Branding per Product
- **Upload logo** for checkout page
- **Color scheme** customization
- **Custom thank-you message**
- **Email templates** per product
- Preview before publishing

#### Coupon Code Support
- **Create coupons** scoped to products
- **Percentage or fixed amount** discounts
- **Duration:** once, repeating, forever
- **Usage limits:** total redemptions, per customer
- **Expiration dates**
- Display coupon in checkout

**Implementation:**
- Create `coupons` table
- Integrate with Stripe Coupons API
- Apply discounts at checkout
- Track coupon usage and redemptions

---

### 4. Smart Pricing Features

**Goal:**
Advanced pricing capabilities to optimize revenue.

**Features to Implement:**

#### A/B Testing for Prices
- **Test different price points** on the same product
- **Split traffic** between variants
- **Track conversion rates** by variant
- **Statistical significance** calculation
- **Winner selection** and rollout

**Use case:** Test $29/mo vs $39/mo to find optimal price point

#### Dynamic Pricing Rules
- **Geography-based pricing**
  - Different prices for different countries
  - Purchasing Power Parity (PPP) adjustments
- **Time-based pricing**
  - Early bird discounts
  - Seasonal promotions
  - Flash sales
- **Customer segment pricing**
  - Non-profits, students, enterprises
  - Volume discounts

#### Volume/Usage-Based Pricing Tiers
- **Per-seat pricing** (e.g., $10/user/month)
- **Usage tiers** (e.g., 0-1000 requests: $0, 1001-10000: $0.01/request)
- **Graduated pricing** (different rates at different tiers)
- **Volume discounts** (price decreases as usage increases)

**Implementation:**
- Extend product pricing model to support:
  - Tiered pricing
  - Seat-based pricing
  - Usage-based pricing
- Create pricing calculator widget
- Integrate with Stripe Metered Billing

#### Add-ons and Upsells
- **Optional add-ons** to base product
  - Extra storage ($5/mo)
  - Priority support ($20/mo)
  - Advanced features ($15/mo)
- **One-time upsells** at checkout
  - Setup/onboarding service
  - Custom integrations
- **Cross-sells** (related products)

**Implementation:**
- Create `product_addons` table
- Link add-ons to products
- Display during checkout
- Calculate total price with add-ons

---

### 5. Subscription Management

**Goal:**
Provide customers with self-service subscription management capabilities.

**Features to Implement:**

#### Customer Portal Integration
- **Embedded portal** (iframe or redirect)
- **View current subscription** details
  - Product, price, billing cycle
  - Next billing date
  - Payment method
- **Update payment method**
  - Add/remove cards
  - Set default payment method
- **View billing history**
  - Past invoices
  - Download PDFs
  - Payment receipts

**Implementation:**
- Create customer portal routes
- Build portal UI components
- Integrate with Stripe Customer Portal (or custom)
- Embed in merchant's app

#### Self-Service Upgrades/Downgrades
- **Compare plans** side-by-side
- **Preview changes** before confirming
  - New price
  - Proration amount
  - Next billing date
- **Instant upgrades** (immediate access)
- **Downgrades** effective at period end

**Implementation:**
- Create upgrade/downgrade endpoints
- Calculate proration (Stripe handles this)
- Update entitlements immediately
- Send confirmation emails

#### Proration Handling
- **Prorated credits** for downgrades
- **Prorated charges** for upgrades
- **Preview proration** before change
- **Flexible proration modes:**
  - Always prorate
  - Never prorate
  - Prorate only on upgrades

#### Cancellation Flows with Retention Offers
- **Multi-step cancellation**
  - Confirm cancellation intent
  - Ask for feedback (reason)
  - Offer retention incentives
- **Retention offers:**
  - Pause subscription (3 months)
  - Discount (50% off for 3 months)
  - Downgrade to lower tier
  - Free trial extension
- **Win-back campaigns**
  - Email after cancellation
  - Special offers to return

**Implementation:**
- Create cancellation flow UI
- Build retention offer system
- Track cancellation reasons
- Automate win-back emails

---

### 6. Missing API Endpoints

**To Be Implemented:**

#### Product Subscribers
```
GET /api/products/:id/subscribers
Query params: status, limit, offset
Response: Paginated list of customers subscribed to this product
```

**Use case:** See who's using this product, contact customers for feedback

#### Product Analytics
```
GET /api/products/:id/analytics
Query params: start_date, end_date, metrics[]
Response: Revenue, conversions, churn, etc.
```

**Use case:** Power the Metrics tab and dashboard

#### Checkout Links
```
POST /api/products/:id/checkout-links
Body: { name, price_id, coupon_id, trial_override }
Response: { id, url, short_url }

GET /api/products/:id/checkout-links
Response: List of checkout links for this product

DELETE /api/checkout-links/:id
Response: { success: true }
```

**Use case:** Generate shareable checkout URLs

#### Product Usage (Metering)
```
GET /api/products/:id/usage
Query params: customer_id, start_date, end_date
Response: Usage data for metered features
```

**Use case:** Show customers their usage, identify upgrade opportunities

#### Product Webhooks
```
POST /api/products/:id/webhooks
Body: { url, events[] }
Response: { id, url, secret }

GET /api/products/:id/webhooks
Response: List of webhooks for this product

DELETE /api/webhooks/:id
Response: { success: true }
```

**Use case:** Let organizations receive events when subscriptions change

---

## Implementation Priority (Phase 2)

### High Priority
1. **Full Metrics Tab** - Organizations need to see product performance
2. **Customer Portal** - Self-service reduces support burden
3. **Checkout Links** - Easy way to sell products without coding
4. **Subscribers List** - See who's using the product

### Medium Priority
5. **Upgrade/Downgrade Flows** - Increase revenue through tier changes
6. **Cancellation Flows** - Reduce churn with retention offers
7. **Product Analytics Dashboard** - Deep insights for optimization
8. **Coupon Code Support** - Run promotions and discounts

### Low Priority (Future)
9. **A/B Testing** - Advanced pricing optimization
10. **Dynamic Pricing Rules** - Complex pricing strategies
11. **Add-ons and Upsells** - Additional revenue streams
12. **Product Webhooks** - Advanced integration capabilities

---

## Technical Considerations

### Performance
- **Cache metrics** (update daily, not real-time)
- **Aggregate tables** for fast queries
- **Paginate large datasets** (subscribers, invoices)
- **Background jobs** for heavy calculations

### Scalability
- **Separate analytics DB** (OLAP vs OLTP)
- **Event streaming** for real-time updates (if needed)
- **API rate limiting** for public endpoints
- **CDN for checkout pages**

### Security
- **Webhook signature verification**
- **API key authentication** for SDK
- **CORS configuration** for embedded checkout
- **PCI compliance** for payment data (use Stripe)

### Monitoring
- **Track API errors** and latencies
- **Monitor Stripe sync failures**
- **Alert on churn spikes**
- **Dashboard for ops team**

---

## Success Metrics

**For Phase 2, measure:**
- **Adoption:** % of organizations using each feature
- **Engagement:** How often organizations check metrics
- **Revenue impact:** Increase in upgrades/downgrades via portal
- **Churn reduction:** Impact of retention flows
- **Support reduction:** Decrease in billing-related tickets
- **Checkout conversions:** Improvement from embedded checkout

---

## Reference Implementations

**Check Polar.sh for:**
- Metrics dashboard UI (`/Users/ankushkumar/Code/payment/billingos`)
- Subscription management flows
- Checkout integration patterns
- Analytics aggregation queries
- Customer portal components

**Other References:**
- Stripe Dashboard (metrics visualization)
- ChartMogul (analytics best practices)
- Baremetrics (cohort analysis)
- ProfitWell (retention tactics)

---

## Next Steps (After Phase 1)

1. **Prioritize features** based on customer feedback
2. **Create detailed specs** for each feature
3. **Design mockups** for new UI components
4. **Estimate effort** for each feature
5. **Schedule sprints** for Phase 2 implementation
6. **Track progress** in `docs/product-detail-v2/progress.md`

---

## Questions to Answer in Phase 2 Planning

- Do we need real-time metrics or is daily aggregation sufficient?
- Should we build custom customer portal or use Stripe's hosted portal?
- Which chart library provides best performance and UX?
- How to handle multi-currency analytics?
- Do we need data warehouse (e.g., Snowflake) for analytics?
- Should checkout SDK support React, Vue, vanilla JS?

---

**Document Created:** 2025-01-31
**Status:** Planning
**Next Review:** After Phase 1 completion
