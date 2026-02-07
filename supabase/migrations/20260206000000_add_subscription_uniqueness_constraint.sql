-- Add constraint to prevent duplicate active subscriptions
-- A customer can only have one active/trialing subscription per product

-- First, clean up any existing duplicates (keep the one with valid Stripe subscription ID)
DELETE FROM subscriptions s1
WHERE EXISTS (
    SELECT 1
    FROM subscriptions s2
    WHERE s2.customer_id = s1.customer_id
      AND s2.product_id = s1.product_id
      AND s2.id != s1.id
      AND s2.stripe_subscription_id LIKE 'sub_%'
      AND (s1.stripe_subscription_id NOT LIKE 'sub_%' OR s1.stripe_subscription_id IS NULL)
);

-- Add a partial unique index to prevent duplicate active subscriptions
-- This allows multiple cancelled subscriptions but only one active per customer/product
CREATE UNIQUE INDEX idx_unique_active_subscription
ON subscriptions (customer_id, product_id)
WHERE status IN ('active', 'trialing', 'incomplete', 'past_due')
  AND ended_at IS NULL;

-- Add a check constraint to ensure stripe_subscription_id format is correct when present
ALTER TABLE subscriptions
ADD CONSTRAINT check_stripe_subscription_id_format
CHECK (
    stripe_subscription_id IS NULL
    OR stripe_subscription_id LIKE 'sub_%'
    OR stripe_subscription_id = '' -- Allow empty string for legacy records
);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT check_stripe_subscription_id_format ON subscriptions IS
'Ensures stripe_subscription_id follows Stripe format (sub_xxxx) when present';

COMMENT ON INDEX idx_unique_active_subscription IS
'Prevents duplicate active/trialing subscriptions for the same customer and product';

-- Log the changes
DO $$
BEGIN
    RAISE NOTICE 'Added subscription uniqueness constraints:';
    RAISE NOTICE '  - Unique index on (customer_id, product_id) for active subscriptions';
    RAISE NOTICE '  - Check constraint for stripe_subscription_id format';
    RAISE NOTICE '  - Cleaned up any existing duplicate subscriptions';
END $$;