-- Create feature_grants table
CREATE TABLE feature_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,

  -- Grant lifecycle
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- Resolved feature configuration (snapshot at grant time)
  -- Prevents changes to feature affecting active grants
  properties JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(subscription_id, feature_id),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

-- Indexes
CREATE INDEX idx_feature_grants_customer ON feature_grants(customer_id);
CREATE INDEX idx_feature_grants_subscription ON feature_grants(subscription_id);
CREATE INDEX idx_feature_grants_feature ON feature_grants(feature_id);
CREATE INDEX idx_feature_grants_active ON feature_grants(customer_id, revoked_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_feature_grants_granted ON feature_grants(granted_at) WHERE granted_at IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_feature_grants_updated_at
  BEFORE UPDATE ON feature_grants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE feature_grants ENABLE ROW LEVEL SECURITY;

-- Organizations can view grants for their customers
CREATE POLICY "Organizations can view grants for their customers"
  ON feature_grants FOR SELECT
  USING (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can create grants for their customers"
  ON feature_grants FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can update grants for their customers"
  ON feature_grants FOR UPDATE
  USING (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can delete grants for their customers"
  ON feature_grants FOR DELETE
  USING (customer_id IN (
    SELECT id FROM customers WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

-- Comments
COMMENT ON TABLE feature_grants IS 'Active feature grants for customers based on their subscriptions';
COMMENT ON COLUMN feature_grants.granted_at IS 'When feature was activated (NULL if pending)';
COMMENT ON COLUMN feature_grants.revoked_at IS 'When feature was revoked (NULL if still active)';
COMMENT ON COLUMN feature_grants.properties IS 'Snapshot of feature configuration at grant time';
