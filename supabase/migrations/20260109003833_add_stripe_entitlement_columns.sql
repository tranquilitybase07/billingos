-- ================================================
-- STRIPE ENTITLEMENTS INTEGRATION - PHASE 1
-- Add Stripe reference columns and sync tracking
-- ================================================
-- This migration adds columns to track Stripe Entitlements API objects
-- and enables the system to use Stripe as source of truth for features/entitlements

-- ================================================
-- 1. UPDATE FEATURES TABLE
-- Add Stripe Feature ID and sync tracking columns
-- ================================================

ALTER TABLE features
ADD COLUMN IF NOT EXISTS stripe_feature_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_sync_status TEXT DEFAULT 'pending' CHECK (stripe_sync_status IN ('pending', 'synced', 'failed', 'conflict'));

-- Add index for lookups by Stripe Feature ID
CREATE INDEX IF NOT EXISTS idx_features_stripe_feature_id ON features(stripe_feature_id);

-- Add index for finding unsynced features
CREATE INDEX IF NOT EXISTS idx_features_sync_status ON features(stripe_sync_status) WHERE stripe_sync_status != 'synced';

COMMENT ON COLUMN features.stripe_feature_id IS 'Stripe Entitlements Feature ID (e.g., feat_xxx)';
COMMENT ON COLUMN features.stripe_synced_at IS 'Last successful sync timestamp with Stripe';
COMMENT ON COLUMN features.stripe_sync_status IS 'Sync status: pending (not synced), synced (in sync), failed (error), conflict (data mismatch)';

-- ================================================
-- 2. UPDATE FEATURE_GRANTS TABLE
-- Add Stripe Active Entitlement ID and sync tracking
-- ================================================

ALTER TABLE feature_grants
ADD COLUMN IF NOT EXISTS stripe_active_entitlement_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_sync_status TEXT DEFAULT 'pending' CHECK (stripe_sync_status IN ('pending', 'synced', 'failed', 'conflict'));

-- Add index for lookups by Stripe Active Entitlement ID
CREATE INDEX IF NOT EXISTS idx_feature_grants_stripe_entitlement_id ON feature_grants(stripe_active_entitlement_id);

-- Add index for finding unsynced grants
CREATE INDEX IF NOT EXISTS idx_feature_grants_sync_status ON feature_grants(stripe_sync_status) WHERE stripe_sync_status != 'synced';

-- Add index for customer + feature lookups (used by SDK)
CREATE INDEX IF NOT EXISTS idx_feature_grants_customer_feature ON feature_grants(customer_id, feature_id) WHERE revoked_at IS NULL;

COMMENT ON COLUMN feature_grants.stripe_active_entitlement_id IS 'Stripe Active Entitlement ID (e.g., entitle_xxx)';
COMMENT ON COLUMN feature_grants.stripe_synced_at IS 'Last successful sync timestamp with Stripe';
COMMENT ON COLUMN feature_grants.stripe_sync_status IS 'Sync status: pending (not synced), synced (in sync), failed (error), conflict (data mismatch)';

-- ================================================
-- 3. CREATE STRIPE_SYNC_EVENTS TABLE
-- Audit log for all Stripe sync operations
-- ================================================

CREATE TABLE IF NOT EXISTS stripe_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What was synced
  entity_type TEXT NOT NULL CHECK (entity_type IN ('feature', 'feature_grant', 'product_feature')),
  entity_id UUID NOT NULL,
  stripe_object_id TEXT,

  -- Sync details
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'backfill', 'webhook')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'partial')),

  -- Error tracking
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Request/Response data for debugging
  request_payload JSONB,
  response_payload JSONB,

  -- Metadata
  triggered_by TEXT, -- 'api', 'webhook', 'backfill_script', 'daily_sync'
  triggered_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying sync events
CREATE INDEX IF NOT EXISTS idx_stripe_sync_events_org ON stripe_sync_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_sync_events_entity ON stripe_sync_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_stripe_sync_events_status ON stripe_sync_events(status, created_at DESC) WHERE status = 'failure';
CREATE INDEX IF NOT EXISTS idx_stripe_sync_events_stripe_object ON stripe_sync_events(stripe_object_id);

COMMENT ON TABLE stripe_sync_events IS 'Audit log for all Stripe Entitlements API sync operations';
COMMENT ON COLUMN stripe_sync_events.entity_type IS 'Type of local entity: feature, feature_grant, product_feature';
COMMENT ON COLUMN stripe_sync_events.entity_id IS 'ID of local entity (features.id, feature_grants.id, etc)';
COMMENT ON COLUMN stripe_sync_events.stripe_object_id IS 'Stripe object ID (feat_xxx, entitle_xxx, etc)';
COMMENT ON COLUMN stripe_sync_events.operation IS 'Operation performed: create, update, delete, backfill, webhook';
COMMENT ON COLUMN stripe_sync_events.triggered_by IS 'Source that triggered sync: api, webhook, backfill_script, daily_sync';

-- ================================================
-- 4. UPDATE PRODUCT_FEATURES TABLE
-- Add metadata for Stripe Product-Feature linking
-- ================================================

-- Add column to track if feature is attached to Stripe Product
ALTER TABLE product_features
ADD COLUMN IF NOT EXISTS stripe_synced BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_synced_at TIMESTAMPTZ;

-- Add index for finding unsynced product features
CREATE INDEX IF NOT EXISTS idx_product_features_unsynced ON product_features(product_id) WHERE stripe_synced = FALSE;

COMMENT ON COLUMN product_features.stripe_synced IS 'Whether this feature is attached to the Stripe Product';
COMMENT ON COLUMN product_features.stripe_synced_at IS 'When the feature was attached to Stripe Product';

-- ================================================
-- 5. ADD HELPER FUNCTIONS
-- ================================================

-- Function to mark entity as synced
CREATE OR REPLACE FUNCTION mark_feature_synced(
  p_feature_id UUID,
  p_stripe_feature_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE features
  SET
    stripe_feature_id = p_stripe_feature_id,
    stripe_synced_at = NOW(),
    stripe_sync_status = 'synced'
  WHERE id = p_feature_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark feature grant as synced
CREATE OR REPLACE FUNCTION mark_feature_grant_synced(
  p_grant_id UUID,
  p_stripe_entitlement_id TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE feature_grants
  SET
    stripe_active_entitlement_id = p_stripe_entitlement_id,
    stripe_synced_at = NOW(),
    stripe_sync_status = 'synced'
  WHERE id = p_grant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log sync event
CREATE OR REPLACE FUNCTION log_stripe_sync_event(
  p_organization_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_stripe_object_id TEXT,
  p_operation TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT 'api'
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO stripe_sync_events (
    organization_id,
    entity_type,
    entity_id,
    stripe_object_id,
    operation,
    status,
    error_message,
    triggered_by
  ) VALUES (
    p_organization_id,
    p_entity_type,
    p_entity_id,
    p_stripe_object_id,
    p_operation,
    p_status,
    p_error_message,
    p_triggered_by
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 6. ADD VIEWS FOR MONITORING
-- ================================================

-- View to find features that need syncing
CREATE OR REPLACE VIEW features_needing_sync AS
SELECT
  f.id,
  f.organization_id,
  f.name,
  f.title,
  f.type,
  f.stripe_feature_id,
  f.stripe_sync_status,
  f.created_at,
  f.updated_at
FROM features f
WHERE (f.stripe_sync_status IS NULL OR f.stripe_sync_status IN ('pending', 'failed'));

-- View to find feature grants that need syncing
CREATE OR REPLACE VIEW feature_grants_needing_sync AS
SELECT
  fg.id,
  c.organization_id,
  fg.customer_id,
  fg.feature_id,
  fg.subscription_id,
  fg.stripe_active_entitlement_id,
  fg.stripe_sync_status,
  fg.granted_at,
  fg.revoked_at,
  c.stripe_customer_id,
  f.stripe_feature_id
FROM feature_grants fg
JOIN customers c ON c.id = fg.customer_id
JOIN features f ON f.id = fg.feature_id
WHERE fg.revoked_at IS NULL
  AND (fg.stripe_sync_status IS NULL OR fg.stripe_sync_status IN ('pending', 'failed'));

-- View for sync health monitoring
CREATE OR REPLACE VIEW stripe_sync_health AS
SELECT
  organization_id,
  COUNT(*) FILTER (WHERE entity_type = 'feature' AND status = 'success') as features_synced,
  COUNT(*) FILTER (WHERE entity_type = 'feature' AND status = 'failure') as features_failed,
  COUNT(*) FILTER (WHERE entity_type = 'feature_grant' AND status = 'success') as grants_synced,
  COUNT(*) FILTER (WHERE entity_type = 'feature_grant' AND status = 'failure') as grants_failed,
  MAX(created_at) FILTER (WHERE status = 'failure') as last_failure_at,
  MAX(created_at) as last_sync_at
FROM stripe_sync_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY organization_id;

-- ================================================
-- 7. GRANT PERMISSIONS
-- ================================================

-- Grant access to authenticated users (through RLS policies)
ALTER TABLE stripe_sync_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view sync events for their organizations
CREATE POLICY stripe_sync_events_select_policy ON stripe_sync_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (for API operations)
-- No need for additional policies since service role bypasses RLS

-- ================================================
-- MIGRATION COMPLETE
-- ================================================

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE '✅ Phase 1 Migration Complete!';
  RAISE NOTICE '   - Added stripe_feature_id to features table';
  RAISE NOTICE '   - Added stripe_active_entitlement_id to feature_grants table';
  RAISE NOTICE '   - Created stripe_sync_events audit table';
  RAISE NOTICE '   - Added sync tracking columns and indexes';
  RAISE NOTICE '   - Created helper functions and monitoring views';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Current State:';
  RAISE NOTICE '   - Features needing sync: %', (SELECT COUNT(*) FROM features_needing_sync);
  RAISE NOTICE '   - Feature grants needing sync: %', (SELECT COUNT(*) FROM feature_grants_needing_sync);
END $$;
