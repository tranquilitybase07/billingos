-- Analytics Indexes for Performance Optimization
-- Phase 2: Advanced Metrics
-- Created: February 7, 2026
--
-- Purpose: Optimize analytics queries by adding covering indexes
-- Expected: 50-70% query time reduction

-- ============================================================================
-- 1. MRR Query Optimization
-- ============================================================================
-- Optimizes: GET /analytics/mrr
-- Query: subscriptions JOIN products WHERE status IN ('active', 'trialing')
-- Expected improvement: 500ms → ~100ms
CREATE INDEX IF NOT EXISTS idx_subscriptions_mrr
ON subscriptions(organization_id, status, cancel_at_period_end, product_id);

COMMENT ON INDEX idx_subscriptions_mrr IS
'Covering index for MRR calculation queries. Filters by organization, status, and cancel flag.';

-- ============================================================================
-- 2. Revenue Trend Optimization
-- ============================================================================
-- Optimizes: GET /analytics/revenue/trend
-- Query: payment_intents WHERE status = 'succeeded' GROUP BY date
-- Expected improvement: 300ms → ~80ms
CREATE INDEX IF NOT EXISTS idx_payment_intents_revenue_trend
ON payment_intents(organization_id, status, created_at, amount)
WHERE status = 'succeeded';

COMMENT ON INDEX idx_payment_intents_revenue_trend IS
'Covering index for revenue trend time-series queries. Includes amount for covering query.';

-- ============================================================================
-- 3. Subscription Growth Optimization (Created Subscriptions)
-- ============================================================================
-- Optimizes: GET /analytics/subscriptions/growth (new subscriptions part)
-- Query: subscriptions WHERE created_at BETWEEN start AND end
-- Expected improvement: 300ms → ~70ms
CREATE INDEX IF NOT EXISTS idx_subscriptions_growth_created
ON subscriptions(organization_id, created_at);

COMMENT ON INDEX idx_subscriptions_growth_created IS
'Index for tracking new subscriptions over time. Used in subscription growth metrics.';

-- ============================================================================
-- 4. Subscription Growth Optimization (Canceled Subscriptions)
-- ============================================================================
-- Optimizes: GET /analytics/subscriptions/growth (canceled subscriptions part)
-- Query: subscriptions WHERE canceled_at BETWEEN start AND end
-- Expected improvement: 300ms → ~70ms
CREATE INDEX IF NOT EXISTS idx_subscriptions_growth_canceled
ON subscriptions(organization_id, canceled_at)
WHERE canceled_at IS NOT NULL;

COMMENT ON INDEX idx_subscriptions_growth_canceled IS
'Partial index for tracking canceled subscriptions. Only indexes rows with canceled_at set.';

-- ============================================================================
-- 5. Top Customers by Revenue Optimization
-- ============================================================================
-- Optimizes: GET /analytics/customers/top-revenue
-- Query: payment_intents GROUP BY customer_id ORDER BY SUM(amount) DESC
-- Expected improvement: 200ms → ~50ms
CREATE INDEX IF NOT EXISTS idx_payment_intents_customer_revenue
ON payment_intents(customer_id, organization_id, status, amount, created_at)
WHERE status = 'succeeded';

COMMENT ON INDEX idx_payment_intents_customer_revenue IS
'Covering index for top customers by revenue aggregation. Filters successful payments only.';

-- ============================================================================
-- 6. Active Subscriptions Count Optimization
-- ============================================================================
-- Optimizes: GET /analytics/subscriptions/active
-- Query: COUNT(*) WHERE status IN ('active', 'trialing')
-- Expected improvement: 100ms → ~30ms
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_count
ON subscriptions(organization_id, status)
WHERE status IN ('active', 'trialing');

COMMENT ON INDEX idx_subscriptions_active_count IS
'Partial index for counting active subscriptions. Only indexes active and trialing subscriptions.';

-- ============================================================================
-- 7. Churn Rate Optimization (Phase 2)
-- ============================================================================
-- Optimizes: GET /analytics/churn-rate
-- Query: Complex calculation requiring active_at_start, new, and canceled counts
-- Expected improvement: N/A (new endpoint)
CREATE INDEX IF NOT EXISTS idx_subscriptions_churn_rate
ON subscriptions(organization_id, status, created_at, canceled_at);

COMMENT ON INDEX idx_subscriptions_churn_rate IS
'Composite index for churn rate calculations. Supports both created_at and canceled_at queries.';

-- ============================================================================
-- 8. ARPU Optimization (Phase 2)
-- ============================================================================
-- Optimizes: GET /analytics/arpu
-- Query: Distinct customer count with active subscriptions
-- Note: Reuses idx_subscriptions_mrr for subscription data
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_arpu
ON subscriptions(organization_id, customer_id, status)
WHERE status IN ('active', 'trialing');

COMMENT ON INDEX idx_subscriptions_customer_arpu IS
'Index for distinct active customer count used in ARPU calculation.';

-- ============================================================================
-- Verify Index Creation
-- ============================================================================
-- Run this query to verify all indexes were created:
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
