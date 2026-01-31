-- Create payment_intents table to track Stripe payment intents
CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255),
  client_secret VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL, -- Amount in cents
  currency VARCHAR(10) NOT NULL DEFAULT 'usd',
  status VARCHAR(50) NOT NULL, -- requires_payment_method, requires_confirmation, succeeded, etc.
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  price_id UUID REFERENCES product_prices(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create checkout_sessions table to manage checkout flow
CREATE TABLE checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  customer_external_id VARCHAR(255), -- External user ID from merchant
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add payment tracking to subscriptions
-- Check if columns exist before adding them
DO $$
BEGIN
  -- Add payment_intent_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'subscriptions'
                 AND column_name = 'payment_intent_id') THEN
    ALTER TABLE subscriptions
    ADD COLUMN payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL;
  END IF;

  -- Add trial_end if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'subscriptions'
                 AND column_name = 'trial_end') THEN
    ALTER TABLE subscriptions
    ADD COLUMN trial_end TIMESTAMPTZ;
  END IF;

  -- Add price_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'subscriptions'
                 AND column_name = 'price_id') THEN
    ALTER TABLE subscriptions
    ADD COLUMN price_id UUID REFERENCES product_prices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX idx_payment_intents_organization_id ON payment_intents(organization_id);
CREATE INDEX idx_payment_intents_stripe_id ON payment_intents(stripe_payment_intent_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_created_at ON payment_intents(created_at DESC);

CREATE INDEX idx_checkout_sessions_organization_id ON checkout_sessions(organization_id);
CREATE INDEX idx_checkout_sessions_session_token ON checkout_sessions(session_token);
CREATE INDEX idx_checkout_sessions_payment_intent_id ON checkout_sessions(payment_intent_id);
CREATE INDEX idx_checkout_sessions_expires_at ON checkout_sessions(expires_at);

-- Add updated_at trigger for payment_intents
CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for checkout_sessions
CREATE TRIGGER update_checkout_sessions_updated_at BEFORE UPDATE ON checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for payment_intents
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

-- Organizations can view their own payment intents
CREATE POLICY "Organizations can view own payment intents" ON payment_intents
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM user_organizations
    WHERE user_id = auth.uid()
  ));

-- Add RLS policies for checkout_sessions
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Organizations can view their own checkout sessions
CREATE POLICY "Organizations can view own checkout sessions" ON checkout_sessions
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM user_organizations
    WHERE user_id = auth.uid()
  ));

-- Add comments for documentation
COMMENT ON TABLE payment_intents IS 'Tracks Stripe payment intents for subscription payments';
COMMENT ON TABLE checkout_sessions IS 'Manages checkout sessions for payment collection';
COMMENT ON COLUMN payment_intents.amount IS 'Amount in smallest currency unit (cents for USD)';
COMMENT ON COLUMN payment_intents.status IS 'Stripe payment intent status: requires_payment_method, requires_confirmation, processing, requires_action, canceled, succeeded';
COMMENT ON COLUMN checkout_sessions.customer_external_id IS 'External user ID provided by the merchant system';
COMMENT ON COLUMN subscriptions.payment_intent_id IS 'Reference to the payment intent that created this subscription';
COMMENT ON COLUMN subscriptions.trial_end IS 'End date of trial period if applicable';
COMMENT ON COLUMN subscriptions.price_id IS 'Reference to the specific price selected for this subscription';