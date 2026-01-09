-- Create features table
CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Feature identification
  name VARCHAR(100) NOT NULL, -- Technical key: 'api_calls_limit'
  title VARCHAR(255) NOT NULL, -- Display name: '1,000 API Calls per Month'
  description TEXT,

  -- Feature type
  type VARCHAR(50) NOT NULL CHECK (type IN ('boolean_flag', 'usage_quota', 'numeric_limit')),

  -- Configuration (JSONB)
  -- For boolean_flag: {}
  -- For usage_quota: {limit: 1000, period: 'month', unit: 'calls'}
  -- For numeric_limit: {limit: 100, unit: 'projects'}
  properties JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_id, name)
);

-- Indexes
CREATE INDEX idx_features_organization ON features(organization_id);
CREATE INDEX idx_features_name ON features(organization_id, name);
CREATE INDEX idx_features_type ON features(type);

-- Trigger for updated_at
CREATE TRIGGER update_features_updated_at
  BEFORE UPDATE ON features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE features ENABLE ROW LEVEL SECURITY;

-- Organizations can manage their own features
CREATE POLICY "Organizations can view their own features"
  ON features FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can create their own features"
  ON features FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can update their own features"
  ON features FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can delete their own features"
  ON features FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comments
COMMENT ON TABLE features IS 'Reusable features/entitlements for products';
COMMENT ON COLUMN features.name IS 'Technical identifier (e.g., api_calls_limit)';
COMMENT ON COLUMN features.title IS 'Display name for pricing tables (e.g., 1,000 API Calls per Month)';
COMMENT ON COLUMN features.type IS 'Feature type: boolean_flag, usage_quota, or numeric_limit';
COMMENT ON COLUMN features.properties IS 'Type-specific configuration (limits, periods, units)';
