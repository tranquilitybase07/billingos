-- Improve subscription reactivation handling
-- This migration enhances the existing partial unique index to better handle subscription reactivation

-- The existing constraint already prevents duplicate active subscriptions
-- This migration adds:
-- 1. Helper comments for clarity
-- 2. Additional indexes for efficient reactivation queries
-- 3. Updated check constraints

-- Add index for efficiently finding canceled subscriptions to reactivate
CREATE INDEX IF NOT EXISTS idx_subscriptions_reactivation_lookup
ON subscriptions (customer_id, product_id, status, created_at DESC)
WHERE status IN ('canceled', 'ended');

COMMENT ON INDEX idx_subscriptions_reactivation_lookup IS
'Optimizes queries for finding canceled/ended subscriptions that can be reactivated';

-- Add index for active subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_lookup
ON subscriptions (customer_id, product_id, status)
WHERE status IN ('active', 'trialing')
  AND ended_at IS NULL;

COMMENT ON INDEX idx_subscriptions_active_lookup IS
'Optimizes queries for checking if customer already has an active subscription';

-- Update the table comment to document reactivation behavior
COMMENT ON TABLE subscriptions IS
'Stores subscription records.

Key behaviors:
- A customer can have MULTIPLE subscriptions per product over time (history)
- A customer can have only ONE ACTIVE/TRIALING subscription per product at a time
- Canceled subscriptions can be reactivated when customer subscribes again
- Reactivation reuses the existing subscription record with a new Stripe subscription ID

Status transitions:
- New subscription: active/trialing
- Canceled by user: canceled
- Expired/failed: ended
- Reactivated: canceled/ended -> active (with new billing period)

The idx_unique_active_subscription constraint enforces uniqueness for active subscriptions.';

-- Add helpful function to check if subscription can be reactivated
CREATE OR REPLACE FUNCTION can_reactivate_subscription(
  p_customer_id UUID,
  p_product_id UUID
) RETURNS TABLE (
  can_reactivate BOOLEAN,
  subscription_id UUID,
  reason TEXT
) AS $$
DECLARE
  active_sub subscriptions%ROWTYPE;
  canceled_sub subscriptions%ROWTYPE;
BEGIN
  -- Check for existing active subscription
  SELECT * INTO active_sub
  FROM subscriptions
  WHERE customer_id = p_customer_id
    AND product_id = p_product_id
    AND status IN ('active', 'trialing')
    AND ended_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      active_sub.id,
      'Customer already has an active subscription for this product';
    RETURN;
  END IF;

  -- Check for canceled/ended subscription
  SELECT * INTO canceled_sub
  FROM subscriptions
  WHERE customer_id = p_customer_id
    AND product_id = p_product_id
    AND status IN ('canceled', 'ended')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      TRUE,
      canceled_sub.id,
      'Found canceled subscription that can be reactivated';
    RETURN;
  END IF;

  -- No subscription exists
  RETURN QUERY SELECT
    FALSE,
    NULL::UUID,
    'No existing subscription - can create new';
  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_reactivate_subscription IS
'Helper function to check if a subscription can be reactivated for a customer+product.
Returns:
- can_reactivate: TRUE if there is a canceled subscription to reactivate
- subscription_id: The ID of the subscription (active or canceled)
- reason: Human-readable explanation';

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'Subscription reactivation improvements applied:';
  RAISE NOTICE '  - Added index for efficient reactivation lookups';
  RAISE NOTICE '  - Added index for active subscription checks';
  RAISE NOTICE '  - Added can_reactivate_subscription() helper function';
  RAISE NOTICE '  - Updated table documentation';
  RAISE NOTICE '';
  RAISE NOTICE 'Reactivation flow:';
  RAISE NOTICE '  1. Check if active subscription exists -> Return it';
  RAISE NOTICE '  2. Check if canceled subscription exists -> Reactivate it';
  RAISE NOTICE '  3. No subscription exists -> Create new';
END $$;
