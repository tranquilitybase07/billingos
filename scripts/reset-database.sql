-- ============================================================
-- DATABASE RESET SCRIPT (SQL)
-- ============================================================
--
-- This script deletes all organization data from the database.
-- Execute this via psql or Supabase SQL Editor.
--
-- WARNING: This is IRREVERSIBLE! Make sure you:
-- 1. Have a backup if needed
-- 2. Manually clean up Stripe data separately
--
-- Usage:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/reset-database.sql
--
-- Or copy-paste into Supabase SQL Editor (http://127.0.0.1:54323)
-- ============================================================

-- Show current statistics BEFORE deletion
DO $$
DECLARE
  tbl TEXT;
  row_count BIGINT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Current Database Statistics:';
  RAISE NOTICE '';

  FOR tbl IN
    SELECT unnest(ARRAY[
      'users', 'organizations', 'accounts', 'user_organizations',
      'products', 'product_prices', 'features', 'product_features',
      'customers', 'subscriptions', 'subscription_changes',
      'feature_grants', 'usage_records', 'idempotency_keys',
      'checkout_metadata', 'checkout_sessions', 'payment_intents',
      'portal_sessions', 'discounts', 'discount_products',
      'refunds', 'reconciliation_queue',
      'webhook_events', 'api_keys', 'session_tokens'
    ])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO row_count;
    RAISE NOTICE '  %: % records', tbl, row_count;
  END LOOP;

  RAISE NOTICE '';
END $$;

-- ============================================================
-- OPTION 1: Delete specific organization by slug
-- ============================================================
-- Uncomment and set the organization slug you want to delete:
-- DO $$
-- DECLARE
--   target_org_id UUID;
--   target_account_id UUID;
-- BEGIN
--   SELECT id, account_id INTO target_org_id, target_account_id
--   FROM organizations
--   WHERE slug = 'YOUR_ORG_SLUG_HERE'
--   LIMIT 1;
--
--   IF target_org_id IS NULL THEN
--     RAISE EXCEPTION 'Organization not found';
--   END IF;
--
--   RAISE NOTICE 'Deleting organization: % (%)', 'YOUR_ORG_SLUG_HERE', target_org_id;
--
--   DELETE FROM idempotency_keys WHERE customer_id IN (SELECT id FROM customers WHERE organization_id = target_org_id);
--   DELETE FROM portal_sessions WHERE organization_id = target_org_id;
--   DELETE FROM usage_records WHERE customer_id IN (SELECT id FROM customers WHERE organization_id = target_org_id);
--   DELETE FROM feature_grants WHERE customer_id IN (SELECT id FROM customers WHERE organization_id = target_org_id);
--   DELETE FROM subscription_changes WHERE organization_id = target_org_id;
--   DELETE FROM checkout_metadata WHERE organization_id = target_org_id;
--   DELETE FROM checkout_sessions WHERE organization_id = target_org_id;
--   DELETE FROM refunds WHERE organization_id = target_org_id;
--   DELETE FROM subscriptions WHERE organization_id = target_org_id;
--   DELETE FROM payment_intents WHERE organization_id = target_org_id;
--   DELETE FROM customers WHERE organization_id = target_org_id;
--   DELETE FROM discount_products WHERE discount_id IN (SELECT id FROM discounts WHERE organization_id = target_org_id);
--   DELETE FROM product_features WHERE product_id IN (SELECT id FROM products WHERE organization_id = target_org_id);
--   DELETE FROM product_prices WHERE product_id IN (SELECT id FROM products WHERE organization_id = target_org_id);
--   DELETE FROM products WHERE organization_id = target_org_id;
--   DELETE FROM features WHERE organization_id = target_org_id;
--   DELETE FROM discounts WHERE organization_id = target_org_id;
--   DELETE FROM session_tokens WHERE organization_id = target_org_id;
--   DELETE FROM api_keys WHERE organization_id = target_org_id;
--   DELETE FROM webhook_events WHERE organization_id = target_org_id;
--   DELETE FROM user_organizations WHERE organization_id = target_org_id;
--   DELETE FROM accounts WHERE id = target_account_id;
--   DELETE FROM organizations WHERE id = target_org_id;
--
--   RAISE NOTICE '✅ Organization deleted successfully';
-- END $$;

-- ============================================================
-- OPTION 2: Delete ALL organizations and data (keep users)
-- ============================================================

BEGIN;

-- 1. Idempotency keys (references customers)
DELETE FROM idempotency_keys;

-- 2. Portal sessions (references customers + organizations)
DELETE FROM portal_sessions;

-- 3. Usage records
DELETE FROM usage_records;

-- 4. Feature grants
DELETE FROM feature_grants;

-- 5. Subscription changes (references product_prices with NO ACTION — must come before product_prices)
DELETE FROM subscription_changes;

-- 6. Checkout metadata (references product_prices + products with RESTRICT — must come before both)
DELETE FROM checkout_metadata;

-- 7. Checkout sessions (references payment_intents + organizations)
DELETE FROM checkout_sessions;

-- 8. Refunds
DELETE FROM refunds;

-- 9. Reconciliation queue (standalone)
DELETE FROM reconciliation_queue;

-- 10. Subscriptions
DELETE FROM subscriptions;

-- 11. Payment intents
DELETE FROM payment_intents;

-- 12. Customers
DELETE FROM customers;

-- 13. Discount products (junction table)
DELETE FROM discount_products;

-- 14. Product features (junction table)
DELETE FROM product_features;

-- 15. Product prices
DELETE FROM product_prices;

-- 16. Products
DELETE FROM products;

-- 17. Features
DELETE FROM features;

-- 18. Discounts
DELETE FROM discounts;

-- 19. Session tokens
DELETE FROM session_tokens;

-- 20. API keys
DELETE FROM api_keys;

-- 21. Webhook events
DELETE FROM webhook_events;

-- 22. User-organization relationships
DELETE FROM user_organizations;

-- 23. Stripe Connect accounts
DELETE FROM accounts;

-- 24. Organizations
DELETE FROM organizations;

-- Users are intentionally kept.

COMMIT;

-- Show statistics AFTER deletion
DO $$
DECLARE
  tbl TEXT;
  row_count BIGINT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Database Statistics After Reset:';
  RAISE NOTICE '';

  FOR tbl IN
    SELECT unnest(ARRAY[
      'users', 'organizations', 'accounts', 'user_organizations',
      'products', 'product_prices', 'features', 'product_features',
      'customers', 'subscriptions', 'subscription_changes',
      'feature_grants', 'usage_records', 'idempotency_keys',
      'checkout_metadata', 'checkout_sessions', 'payment_intents',
      'portal_sessions', 'discounts', 'discount_products',
      'refunds', 'reconciliation_queue',
      'webhook_events', 'api_keys', 'session_tokens'
    ])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO row_count;
    RAISE NOTICE '  %: % records', tbl, row_count;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Database reset complete!';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  REMINDER: Manually clean up Stripe Dashboard:';
  RAISE NOTICE '   - Products & Prices';
  RAISE NOTICE '   - Customers & Subscriptions';
  RAISE NOTICE '   - Connected Accounts';
  RAISE NOTICE '';
END $$;
