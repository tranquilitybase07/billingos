-- Add stripe_subscription_id to checkout_sessions and payment_intents tables
-- Supports the new direct-subscription checkout flow where subscriptions are
-- created during checkout (before payment) instead of in the webhook.

-- Add stripe_subscription_id to checkout_sessions
ALTER TABLE checkout_sessions
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add stripe_subscription_id to payment_intents
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add index for looking up checkout sessions by stripe subscription ID
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe_subscription_id
ON checkout_sessions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Add index for looking up payment intents by stripe subscription ID
CREATE INDEX IF NOT EXISTS idx_payment_intents_stripe_subscription_id
ON payment_intents(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN checkout_sessions.stripe_subscription_id IS
'Stripe subscription ID created during checkout (direct-subscription flow). Used to link checkout to its subscription.';

COMMENT ON COLUMN payment_intents.stripe_subscription_id IS
'Stripe subscription ID that generated this payment intent (direct-subscription flow).';

DO $$
BEGIN
  RAISE NOTICE 'Added stripe_subscription_id columns to checkout_sessions and payment_intents tables';
END $$;
