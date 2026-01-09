-- Create usage_records table
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  -- Billing period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Usage tracking
  consumed_units DECIMAL(20, 6) DEFAULT 0 CHECK (consumed_units >= 0), -- Allow fractional units
  limit_units DECIMAL(20, 6) CHECK (limit_units IS NULL OR limit_units >= 0), -- NULL = unlimited

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(customer_id, feature_id, period_start),
  CHECK (period_end > period_start),
  CHECK (limit_units IS NULL OR consumed_units <= limit_units)
);

-- Indexes
CREATE INDEX idx_usage_records_customer ON usage_records(customer_id);
CREATE INDEX idx_usage_records_feature ON usage_records(feature_id);
CREATE INDEX idx_usage_records_subscription ON usage_records(subscription_id);
CREATE INDEX idx_usage_records_period ON usage_records(customer_id, feature_id, period_start, period_end);
-- Note: Can't use NOW() in index predicate (not immutable), but period index above handles active period queries efficiently

-- Trigger for updated_at
CREATE TRIGGER update_usage_records_updated_at
  BEFORE UPDATE ON usage_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Organizations can view usage records for their customers
CREATE POLICY "Organizations can view usage records for their customers"
  ON usage_records FOR SELECT
  USING (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can create usage records for their customers"
  ON usage_records FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can update usage records for their customers"
  ON usage_records FOR UPDATE
  USING (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can delete usage records for their customers"
  ON usage_records FOR DELETE
  USING (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

-- Comments
COMMENT ON TABLE usage_records IS 'Track quota consumption for usage_quota type features';
COMMENT ON COLUMN usage_records.period_start IS 'Start of billing period (aligned with subscription)';
COMMENT ON COLUMN usage_records.period_end IS 'End of billing period';
COMMENT ON COLUMN usage_records.consumed_units IS 'Units consumed in this period (fractional allowed)';
COMMENT ON COLUMN usage_records.limit_units IS 'Maximum units allowed (NULL for unlimited)';
