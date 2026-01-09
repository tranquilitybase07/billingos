-- Create subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),

  -- Subscription details
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing',
    'active', 'past_due', 'canceled', 'unpaid'
  )),
  amount INTEGER NOT NULL CHECK (amount >= 0), -- Total amount in cents
  currency VARCHAR(3) NOT NULL,

  -- Billing period
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,

  -- Trial
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  -- Cancellation
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Stripe integration
  stripe_subscription_id VARCHAR(255),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_id, stripe_subscription_id),
  CHECK (current_period_end > current_period_start)
);

-- Indexes
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_product ON subscriptions(product_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_organization ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_period ON subscriptions(current_period_start, current_period_end);
CREATE INDEX idx_subscriptions_active ON subscriptions(status, current_period_end) WHERE status IN ('active', 'trialing');

-- Trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Organizations can manage their own subscriptions
CREATE POLICY "Organizations can view their own subscriptions"
  ON subscriptions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can create their own subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can update their own subscriptions"
  ON subscriptions FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can delete their own subscriptions"
  ON subscriptions FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comments
COMMENT ON TABLE subscriptions IS 'Customer subscriptions to products';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status: incomplete, trialing, active, past_due, canceled, unpaid';
COMMENT ON COLUMN subscriptions.amount IS 'Total subscription amount in cents';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'If true, subscription cancels at end of current period';
