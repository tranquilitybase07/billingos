-- Create churn_flows table: merchant-designed cancellation/save flows
CREATE TABLE churn_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Ordered step list (survey / offer / confirm). JSON is deliberate in v1 - not normalized.
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Reserved for future global/segment targeting rules. Reason->offer routing rides on steps.
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_churn_flows_organization ON churn_flows(organization_id);
CREATE INDEX idx_churn_flows_enabled ON churn_flows(organization_id) WHERE enabled = true;

CREATE TRIGGER update_churn_flows_updated_at
  BEFORE UPDATE ON churn_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE churn_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations can view their own churn flows"
  ON churn_flows FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can create churn flows"
  ON churn_flows FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can update their own churn flows"
  ON churn_flows FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can delete their own churn flows"
  ON churn_flows FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

COMMENT ON TABLE churn_flows IS 'Merchant-designed churn/cancellation save flows rendered in the portal and SDK embed';
COMMENT ON COLUMN churn_flows.steps IS 'Ordered survey/offer/confirm steps; offers attach to survey reasons';
COMMENT ON COLUMN churn_flows.targeting IS 'Reserved for future global/segment targeting rules';
