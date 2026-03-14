-- Add discount tracking columns to subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES discounts(id),
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER,
  ADD COLUMN IF NOT EXISTS discount_code TEXT;

COMMENT ON COLUMN subscriptions.discount_id IS 'Discount applied at checkout';
COMMENT ON COLUMN subscriptions.discount_amount IS 'Discount amount in cents applied to first payment';
COMMENT ON COLUMN subscriptions.discount_code IS 'Discount code used at checkout';
