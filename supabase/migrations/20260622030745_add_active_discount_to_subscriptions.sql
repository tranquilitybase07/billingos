-- BOS cache of the live Stripe subscription discount, synced by webhooks.
-- Read source for the churn discount re-redemption guard (never hit Stripe on the hot path).
-- Stripe remains the source of truth; this is written write-through on apply and
-- reconciled by customer.subscription.updated + customer.discount.deleted webhooks.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS active_discount JSONB;

COMMENT ON COLUMN subscriptions.active_discount IS
  'BOS cache of the live Stripe subscription discount. { source, couponId, percentOff?, amountOff?, endsAt? }. null = no active discount.';
