-- Create churn_events table: append-only action-time log of churn flow activity.
-- Written at action-time (not webhook reconciliation) so churn-only subscriptions
-- with no BOS subscriptions row still produce save-rate analytics.
CREATE TABLE churn_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  subscription_id UUID NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
  flow_id UUID NULL REFERENCES churn_flows(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'flow_started','survey_submitted','offer_shown',
    'offer_accepted','offer_declined','canceled','abandoned'
  )),
  reason TEXT NULL,
  feedback TEXT NULL,
  offer JSONB NULL,
  outcome TEXT NULL,
  source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN ('portal','embed','api')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_churn_events_organization ON churn_events(organization_id, created_at DESC);
CREATE INDEX idx_churn_events_type ON churn_events(event_type, created_at DESC);
CREATE INDEX idx_churn_events_subscription ON churn_events(subscription_id);
CREATE INDEX idx_churn_events_reason ON churn_events(reason) WHERE reason IS NOT NULL;

ALTER TABLE churn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations can view their own churn events"
  ON churn_events FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can create churn events"
  ON churn_events FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

COMMENT ON TABLE churn_events IS 'Append-only action-time log of churn flow events for save-rate analytics';
COMMENT ON COLUMN churn_events.customer_id IS 'Nullable: churn-only subscriptions have no BOS customer row';
COMMENT ON COLUMN churn_events.offer IS 'Offer payload { type, ... } for offer_* events';
COMMENT ON COLUMN churn_events.outcome IS 'saved | canceled';
COMMENT ON COLUMN churn_events.source IS 'portal | embed | api';
