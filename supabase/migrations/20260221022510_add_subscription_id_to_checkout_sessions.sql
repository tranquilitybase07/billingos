-- Add subscription_id to checkout_sessions table
-- This allows linking checkout sessions directly to subscriptions,
-- which is useful for free products that don't have payment intents

-- Add subscription_id column
ALTER TABLE checkout_sessions
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_subscription_id
ON checkout_sessions(subscription_id);

-- Add comment
COMMENT ON COLUMN checkout_sessions.subscription_id IS
'Reference to the subscription created from this checkout (especially useful for free products without payment intents)';

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Added subscription_id column to checkout_sessions table';
  RAISE NOTICE 'This enables direct subscription lookup for free product checkouts';
END $$;
