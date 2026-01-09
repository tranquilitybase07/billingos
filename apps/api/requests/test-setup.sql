-- ================================================
-- TEST DATA SETUP FOR SUBSCRIPTIONS API
-- ================================================
-- Run this in your Supabase SQL Editor or via psql
-- to create test customers for subscription testing
-- ================================================

-- Replace this with your actual organization ID
-- You can get it from organizations.http after creating an org
\set org_id 'a0596c99-9f33-4394-a7cd-b2339601c1ce'

-- ================================================
-- 1. CREATE TEST CUSTOMERS
-- ================================================

-- Customer 1: John Doe (For Starter Plan Testing)
-- Note: Using DO NOTHING since we can't use ON CONFLICT with partial unique index
INSERT INTO customers (
  organization_id,
  email,
  name,
  stripe_customer_id,
  metadata
) VALUES (
  :'org_id',
  'john.doe@example.com',
  'John Doe',
  'cus_test_john_doe', -- Temporary ID, will be updated when Stripe customer is created
  '{"test": true, "notes": "Test customer for Starter plan"}'::jsonb
)
RETURNING id, email, name;

-- Customer 2: Jane Smith (For Pro Plan Testing)
INSERT INTO customers (
  organization_id,
  email,
  name,
  stripe_customer_id,
  metadata
) VALUES (
  :'org_id',
  'jane.smith@example.com',
  'Jane Smith',
  'cus_test_jane_smith',
  '{"test": true, "notes": "Test customer for Pro plan"}'::jsonb
)
RETURNING id, email, name;

-- Customer 3: Acme Corp (For Enterprise Testing)
INSERT INTO customers (
  organization_id,
  email,
  name,
  stripe_customer_id,
  metadata
) VALUES (
  :'org_id',
  'billing@acme.corp',
  'Acme Corporation',
  'cus_test_acme_corp',
  '{"test": true, "company": "Acme Corp", "notes": "Enterprise customer"}'::jsonb
)
RETURNING id, email, name;

-- ================================================
-- 2. VIEW CREATED CUSTOMERS
-- ================================================

SELECT
  id,
  email,
  name,
  stripe_customer_id,
  created_at
FROM customers
WHERE organization_id = :'org_id'
ORDER BY created_at DESC;

-- ================================================
-- COPY CUSTOMER IDs FOR YOUR .http FILES
-- ================================================
-- After running this script, copy the customer IDs
-- and update the following files:
--
-- 1. features.http -> @customerId
-- 2. subscriptions.http -> @customerId
--
-- ================================================

-- ================================================
-- HELPFUL QUERIES FOR TESTING
-- ================================================

-- View all features
SELECT id, name, title, type, properties
FROM features
WHERE organization_id = :'org_id'
ORDER BY created_at;

-- View all products with prices
SELECT
  p.id,
  p.name,
  p.trial_days,
  json_agg(
    json_build_object(
      'price_id', pp.id,
      'amount', pp.price_amount,
      'currency', pp.price_currency,
      'interval', pp.recurring_interval
    )
  ) as prices
FROM products p
LEFT JOIN product_prices pp ON pp.product_id = p.id
WHERE p.organization_id = :'org_id'
  AND p.is_archived = false
GROUP BY p.id, p.name, p.trial_days
ORDER BY p.created_at;

-- View product features configuration
SELECT
  p.name as product_name,
  f.name as feature_name,
  f.title as feature_title,
  f.type,
  pf.display_order,
  f.properties as default_properties,
  pf.config as override_config
FROM products p
JOIN product_features pf ON pf.product_id = p.id
JOIN features f ON f.id = pf.feature_id
WHERE p.organization_id = :'org_id'
  AND p.is_archived = false
ORDER BY p.name, pf.display_order;

-- View active subscriptions
SELECT
  s.id,
  c.email as customer_email,
  p.name as product_name,
  s.status,
  s.amount,
  s.current_period_start,
  s.current_period_end,
  s.trial_end,
  s.cancel_at_period_end
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
JOIN products p ON p.id = s.product_id
WHERE s.organization_id = :'org_id'
ORDER BY s.created_at DESC;

-- View granted features for a customer
-- Replace 'CUSTOMER_ID_HERE' with actual customer ID
SELECT
  c.email,
  f.name as feature_name,
  f.title,
  f.type,
  fg.granted_at,
  fg.revoked_at,
  fg.properties,
  s.status as subscription_status
FROM feature_grants fg
JOIN customers c ON c.id = fg.customer_id
JOIN features f ON f.id = fg.feature_id
JOIN subscriptions s ON s.id = fg.subscription_id
WHERE fg.customer_id = 'CUSTOMER_ID_HERE'
  AND fg.revoked_at IS NULL
ORDER BY fg.granted_at DESC;

-- View usage records for a customer
SELECT
  c.email,
  f.name as feature_name,
  ur.consumed_units,
  ur.limit_units,
  (ur.limit_units - ur.consumed_units) as remaining_units,
  ur.period_start,
  ur.period_end
FROM usage_records ur
JOIN customers c ON c.id = ur.customer_id
JOIN features f ON f.id = ur.feature_id
WHERE ur.customer_id = 'CUSTOMER_ID_HERE'
  AND ur.period_start <= NOW()
  AND ur.period_end >= NOW();

-- ================================================
-- CLEANUP (Use with caution!)
-- ================================================

-- Delete test subscriptions (keeps customers)
-- DELETE FROM subscriptions
-- WHERE organization_id = :'org_id'
--   AND created_at > NOW() - INTERVAL '1 day';

-- Delete test customers
-- DELETE FROM customers
-- WHERE organization_id = :'org_id'
--   AND email LIKE '%example.com'
--   OR email LIKE '%acme.corp';

-- Delete test products
-- DELETE FROM products
-- WHERE organization_id = :'org_id'
--   AND created_at > NOW() - INTERVAL '1 day';

-- Delete test features
-- DELETE FROM features
-- WHERE organization_id = :'org_id'
--   AND created_at > NOW() - INTERVAL '1 day';
