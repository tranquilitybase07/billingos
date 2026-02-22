-- Create subscription_changes table for tracking upgrade/downgrade history
CREATE TABLE subscription_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Change type and status
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('upgrade', 'downgrade', 'cancel', 'reactivate')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'scheduled')),

  -- Price changes
  from_price_id UUID REFERENCES product_prices(id),
  to_price_id UUID REFERENCES product_prices(id),
  from_amount INTEGER CHECK (from_amount >= 0), -- Amount in cents
  to_amount INTEGER CHECK (to_amount >= 0), -- Amount in cents

  -- Proration details
  proration_credit INTEGER DEFAULT 0 CHECK (proration_credit >= 0), -- Credit from unused time
  proration_charge INTEGER DEFAULT 0 CHECK (proration_charge >= 0), -- Charge for new plan
  net_amount INTEGER DEFAULT 0, -- Net amount to charge (can be negative for credits)

  -- Scheduling
  scheduled_for TIMESTAMPTZ, -- When the change should happen (NULL = immediate)
  completed_at TIMESTAMPTZ, -- When the change was completed
  failed_reason TEXT, -- Reason if status = 'failed'

  -- Stripe integration
  stripe_invoice_id VARCHAR(255), -- Invoice ID if charge was made

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (from_price_id IS NOT NULL OR to_price_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX idx_subscription_changes_subscription ON subscription_changes(subscription_id);
CREATE INDEX idx_subscription_changes_organization ON subscription_changes(organization_id);
CREATE INDEX idx_subscription_changes_status ON subscription_changes(status);
CREATE INDEX idx_subscription_changes_scheduled ON subscription_changes(scheduled_for)
  WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;
CREATE INDEX idx_subscription_changes_created ON subscription_changes(created_at DESC);
CREATE INDEX idx_subscription_changes_type ON subscription_changes(change_type);

-- Trigger for updated_at
CREATE TRIGGER update_subscription_changes_updated_at
  BEFORE UPDATE ON subscription_changes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE subscription_changes ENABLE ROW LEVEL SECURITY;

-- Organizations can view their own subscription changes
CREATE POLICY "Organizations can view their own subscription changes"
  ON subscription_changes FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Organizations can create subscription changes
CREATE POLICY "Organizations can create subscription changes"
  ON subscription_changes FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Organizations can update their own subscription changes
CREATE POLICY "Organizations can update their own subscription changes"
  ON subscription_changes FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Organizations can delete their own subscription changes (to cancel scheduled changes)
CREATE POLICY "Organizations can delete their own subscription changes"
  ON subscription_changes FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comments
COMMENT ON TABLE subscription_changes IS 'History of subscription plan changes (upgrades, downgrades)';
COMMENT ON COLUMN subscription_changes.change_type IS 'Type of change: upgrade, downgrade, cancel, reactivate';
COMMENT ON COLUMN subscription_changes.status IS 'Status: pending, processing, completed, failed, scheduled';
COMMENT ON COLUMN subscription_changes.proration_credit IS 'Credit from unused portion of old plan (cents)';
COMMENT ON COLUMN subscription_changes.proration_charge IS 'Charge for new plan prorated amount (cents)';
COMMENT ON COLUMN subscription_changes.net_amount IS 'Net amount to charge customer (cents, can be negative)';
COMMENT ON COLUMN subscription_changes.scheduled_for IS 'When to apply the change (NULL for immediate)';
