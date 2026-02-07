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
  table_name TEXT;
  row_count BIGINT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Current Database Statistics:';
  RAISE NOTICE '';

  FOR table_name IN
    SELECT unnest(ARRAY[
      'users', 'organizations', 'accounts', 'user_organizations',
      'products', 'product_prices', 'features', 'product_features',
      'customers', 'subscriptions', 'feature_grants', 'usage_records',
      'webhook_events', 'api_keys', 'session_tokens'
    ])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO row_count;
    RAISE NOTICE '  %: % records', table_name, row_count;
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
--   -- Get organization ID
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
--   -- Delete in correct order
--   DELETE FROM usage_records WHERE customer_id IN (
--     SELECT id FROM customers WHERE organization_id = target_org_id
--   );
--   DELETE FROM feature_grants WHERE customer_id IN (
--     SELECT id FROM customers WHERE organization_id = target_org_id
--   );
--   DELETE FROM subscriptions WHERE organization_id = target_org_id;
--   DELETE FROM customers WHERE organization_id = target_org_id;
--   DELETE FROM product_features WHERE product_id IN (
--     SELECT id FROM products WHERE organization_id = target_org_id
--   );
--   DELETE FROM product_prices WHERE product_id IN (
--     SELECT id FROM products WHERE organization_id = target_org_id
--   );
--   DELETE FROM products WHERE organization_id = target_org_id;
--   DELETE FROM features WHERE organization_id = target_org_id;
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
-- OPTION 2: Delete ALL organizations and data
-- ============================================================
-- Uncomment the lines below to delete EVERYTHING:

BEGIN;

-- 1. Delete usage records
DELETE FROM usage_records;

-- 2. Delete feature grants
DELETE FROM feature_grants;

-- 3. Delete subscriptions
DELETE FROM subscriptions;

-- 4. Delete customers
DELETE FROM customers;

-- 5. Delete product features (junction table)
DELETE FROM product_features;

-- 6. Delete product prices
DELETE FROM product_prices;

-- 7. Delete products
DELETE FROM products;

-- 8. Delete features
DELETE FROM features;

-- 9. Delete session tokens
DELETE FROM session_tokens;

-- 10. Delete API keys
DELETE FROM api_keys;

-- 11. Delete webhook events
DELETE FROM webhook_events;

-- 12. Delete user-organization relationships
DELETE FROM user_organizations;

-- 13. Delete Stripe Connect accounts
DELETE FROM accounts;

-- 14. Delete organizations
DELETE FROM organizations;

-- 15. Delete users (OPTIONAL - comment out to keep users)
-- DELETE FROM users;

COMMIT;

-- Show statistics AFTER deletion
DO $$
DECLARE
  table_name TEXT;
  row_count BIGINT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Database Statistics After Reset:';
  RAISE NOTICE '';

  FOR table_name IN
    SELECT unnest(ARRAY[
      'users', 'organizations', 'accounts', 'user_organizations',
      'products', 'product_prices', 'features', 'product_features',
      'customers', 'subscriptions', 'feature_grants', 'usage_records',
      'webhook_events', 'api_keys', 'session_tokens'
    ])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO row_count;
    RAISE NOTICE '  %: % records', table_name, row_count;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Database reset complete!';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  REMINDER: Manually clean up Stripe Dashboard:';
  RAISE NOTICE '   - Products';
  RAISE NOTICE '   - Prices';
  RAISE NOTICE '   - Customers';
  RAISE NOTICE '   - Subscriptions';
  RAISE NOTICE '   - Connected Accounts';
  RAISE NOTICE '';
END $$;
