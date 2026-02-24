-- Add Stripe Connect account ID and application fee to payment_intents table

-- Add stripe_account_id column to track which connected account the payment is for
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255);

-- Add application_fee_amount column to track platform fees
ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS application_fee_amount INTEGER;

-- Add index for faster lookups by stripe account
CREATE INDEX IF NOT EXISTS idx_payment_intents_stripe_account_id
ON payment_intents(stripe_account_id);

-- Add comment for documentation
COMMENT ON COLUMN payment_intents.stripe_account_id IS 'The Stripe Connect account ID this payment intent was created on';
COMMENT ON COLUMN payment_intents.application_fee_amount IS 'The platform fee amount in cents collected for this payment';