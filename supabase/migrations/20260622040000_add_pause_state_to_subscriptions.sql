-- BOS cache of a live Stripe subscription's pause_collection state, written
-- write-through when a churn pause save-offer is accepted and reconciled by
-- customer.subscription.updated webhooks. Stripe remains the source of truth.
-- Dedicated columns (not metadata) because pause is queryable state the dashboard
-- and save-rate analytics read directly.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resumes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_behavior TEXT;

COMMENT ON COLUMN subscriptions.paused_at IS
  'When billing was paused via pause_collection. null = not paused. BOS cache of Stripe state.';
COMMENT ON COLUMN subscriptions.resumes_at IS
  'Scheduled auto-resume time for a paused subscription. null = indefinite pause (or not paused).';
COMMENT ON COLUMN subscriptions.pause_behavior IS
  'Stripe pause_collection.behavior: keep_as_draft | mark_uncollectible | void. null = not paused.';
