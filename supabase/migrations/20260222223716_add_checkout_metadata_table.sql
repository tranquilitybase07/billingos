-- Create checkout_metadata table (inspired by Autum's pattern)
-- This decouples Stripe from our internal data and enables better retry handling
CREATE TABLE IF NOT EXISTS checkout_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identifiers
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  price_id UUID NOT NULL REFERENCES product_prices(id) ON DELETE RESTRICT,

  -- Checkout details stored separately from Stripe
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),

  -- Product and pricing details
  product_name VARCHAR(255) NOT NULL,
  price_amount INTEGER NOT NULL CHECK (price_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  billing_interval VARCHAR(20), -- 'month', 'year', null for one-time
  billing_interval_count INTEGER DEFAULT 1,

  -- Trial information
  trial_period_days INTEGER,
  should_grant_trial BOOLEAN DEFAULT false,

  -- Feature grants to apply
  features_to_grant JSONB DEFAULT '[]'::jsonb,

  -- Discount/coupon information
  discount_code VARCHAR(100),
  discount_percentage INTEGER CHECK (discount_percentage >= 0 AND discount_percentage <= 100),

  -- Checkout configuration
  payment_method_types JSONB DEFAULT '["card"]'::jsonb,
  success_url TEXT,
  cancel_url TEXT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'expired', 'failed')),
  checkout_session_id VARCHAR(255), -- Stripe checkout session ID once created
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes', -- Metadata expires after 30 minutes
  completed_at TIMESTAMPTZ,

  -- Indexes for lookups
  CONSTRAINT unique_checkout_session UNIQUE (checkout_session_id)
);

-- Indexes for performance
CREATE INDEX idx_checkout_metadata_org ON checkout_metadata(organization_id);
CREATE INDEX idx_checkout_metadata_customer ON checkout_metadata(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_checkout_metadata_status ON checkout_metadata(status);
CREATE INDEX idx_checkout_metadata_expires ON checkout_metadata(expires_at) WHERE status = 'pending';
CREATE INDEX idx_checkout_metadata_session ON checkout_metadata(checkout_session_id) WHERE checkout_session_id IS NOT NULL;

-- Function to clean up expired metadata
CREATE OR REPLACE FUNCTION cleanup_expired_checkout_metadata()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM checkout_metadata
  WHERE expires_at < NOW()
    AND status = 'pending';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON TABLE checkout_metadata IS 'Stores checkout parameters separately from Stripe, enabling better retry handling and data sovereignty. Pattern inspired by Autum.';

-- Add missing columns to checkout_sessions for idempotency and tracking
ALTER TABLE checkout_sessions
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS metadata_id UUID REFERENCES checkout_metadata(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'expired', 'failed'));

-- Add index for product_id lookups
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_product_id ON checkout_sessions(product_id);

-- Add index for status lookups
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status);

-- Create unique constraint for checkout idempotency (prevents duplicate checkouts)
-- Note: Simplified constraint without date function (can't use functions in constraints)
-- This prevents duplicate pending checkouts for same customer/product combo
DROP INDEX IF EXISTS unique_checkout_idempotency;

-- Create partial unique index instead of constraint (PostgreSQL requirement for WHERE clause)
CREATE UNIQUE INDEX unique_checkout_idempotency
ON checkout_sessions(customer_email, product_id)
WHERE status = 'pending';

-- Index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_idempotency
ON checkout_sessions(idempotency_key)
WHERE idempotency_key IS NOT NULL;