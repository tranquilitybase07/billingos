-- Enable PGMQ extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create queues
SELECT pgmq.create('billing_reconciliation');
SELECT pgmq.create('billing_alerts');

-- Migrate existing pending/failed items from reconciliation_queue → PGMQ billing_reconciliation
-- Note: reconciliation_queue has no organization_id column — it's stored inside the details JSONB
INSERT INTO pgmq.q_billing_reconciliation (vt, message)
SELECT
  COALESCE(next_retry_at, NOW()),
  jsonb_build_object(
    'type', type,
    'reference_id', reference_id,
    'priority', COALESCE(priority, 5),
    'details', COALESCE(details, '{}'::jsonb),
    'error_message', error_message,
    'organization_id', (details->>'organization_id'),
    'original_created_at', created_at,
    'migrated_from', 'reconciliation_queue',
    'original_id', id
  )
FROM reconciliation_queue
WHERE status IN ('pending', 'failed')
  AND (next_retry_at IS NULL OR next_retry_at <= NOW());

-- Move manual_review items to alerts queue
INSERT INTO pgmq.q_billing_alerts (vt, message)
SELECT
  NOW(),
  jsonb_build_object(
    'type', type,
    'reference_id', reference_id,
    'priority', COALESCE(priority, 5),
    'details', COALESCE(details, '{}'::jsonb),
    'error_message', error_message,
    'resolution_notes', resolution_notes,
    'organization_id', (details->>'organization_id'),
    'original_created_at', created_at,
    'migrated_from', 'reconciliation_queue',
    'original_id', id
  )
FROM reconciliation_queue
WHERE status = 'manual_review';

-- Keep old table for history but rename to signal deprecation
ALTER TABLE reconciliation_queue RENAME TO reconciliation_queue_legacy;

-- Create SQL wrapper functions for PGMQ operations (callable via supabase.rpc)
-- These are needed because supabase client can't call pgmq schema functions directly

CREATE OR REPLACE FUNCTION pgmq_send(
  p_queue_name TEXT,
  p_message JSONB,
  p_delay INTEGER DEFAULT 0
) RETURNS BIGINT
SECURITY DEFINER
AS $$
  SELECT pgmq.send(p_queue_name, p_message, p_delay);
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pgmq_read(
  p_queue_name TEXT,
  p_vt INTEGER,
  p_qty INTEGER
) RETURNS TABLE (
  msg_id BIGINT,
  read_ct INTEGER,
  enqueued_at TIMESTAMPTZ,
  vt TIMESTAMPTZ,
  message JSONB
)
SECURITY DEFINER
AS $$
  SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
  FROM pgmq.read(p_queue_name, p_vt, p_qty) r;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pgmq_archive(
  p_queue_name TEXT,
  p_msg_id BIGINT
) RETURNS BOOLEAN
SECURITY DEFINER
AS $$
  SELECT pgmq.archive(p_queue_name, p_msg_id);
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pgmq_delete(
  p_queue_name TEXT,
  p_msg_id BIGINT
) RETURNS BOOLEAN
SECURITY DEFINER
AS $$
  SELECT pgmq.delete(p_queue_name, p_msg_id);
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pgmq_metrics(
  p_queue_name TEXT
) RETURNS TABLE (
  queue_name TEXT,
  queue_length BIGINT,
  newest_msg_age_sec INTEGER,
  oldest_msg_age_sec INTEGER,
  total_messages BIGINT,
  scrape_time TIMESTAMPTZ
)
SECURITY DEFINER
AS $$
  SELECT r.queue_name, r.queue_length, r.newest_msg_age_sec, r.oldest_msg_age_sec, r.total_messages, r.scrape_time
  FROM pgmq.metrics(p_queue_name) r;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pgmq_metrics_all()
RETURNS TABLE (
  queue_name TEXT,
  queue_length BIGINT,
  newest_msg_age_sec INTEGER,
  oldest_msg_age_sec INTEGER,
  total_messages BIGINT,
  scrape_time TIMESTAMPTZ
)
SECURITY DEFINER
AS $$
  SELECT r.queue_name, r.queue_length, r.newest_msg_age_sec, r.oldest_msg_age_sec, r.total_messages, r.scrape_time
  FROM pgmq.metrics_all() r;
$$ LANGUAGE sql;

-- Query functions for reading queue/archive tables (PostgREST can't access pgmq schema directly)

CREATE OR REPLACE FUNCTION pgmq_list_messages(
  p_queue_name TEXT,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  msg_id BIGINT,
  read_ct INTEGER,
  enqueued_at TIMESTAMPTZ,
  vt TIMESTAMPTZ,
  message JSONB
)
SECURITY DEFINER
AS $$
BEGIN
  IF p_queue_name = 'billing_reconciliation' THEN
    RETURN QUERY SELECT q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message
      FROM pgmq.q_billing_reconciliation q ORDER BY q.enqueued_at DESC LIMIT p_limit;
  ELSIF p_queue_name = 'billing_alerts' THEN
    RETURN QUERY SELECT q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message
      FROM pgmq.q_billing_alerts q ORDER BY q.enqueued_at DESC LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pgmq_list_archived(
  p_queue_name TEXT,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  msg_id BIGINT,
  read_ct INTEGER,
  enqueued_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  message JSONB
)
SECURITY DEFINER
AS $$
BEGIN
  IF p_queue_name = 'billing_reconciliation' THEN
    RETURN QUERY SELECT a.msg_id, a.read_ct, a.enqueued_at, a.archived_at, a.message
      FROM pgmq.a_billing_reconciliation a ORDER BY a.archived_at DESC LIMIT p_limit;
  ELSIF p_queue_name = 'billing_alerts' THEN
    RETURN QUERY SELECT a.msg_id, a.read_ct, a.enqueued_at, a.archived_at, a.message
      FROM pgmq.a_billing_alerts a ORDER BY a.archived_at DESC LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION pgmq_send IS 'Send a message to a PGMQ queue with optional delay in seconds';
COMMENT ON FUNCTION pgmq_read IS 'Read messages from a PGMQ queue with visibility timeout';
COMMENT ON FUNCTION pgmq_archive IS 'Archive a processed message (moves to archive table)';
COMMENT ON FUNCTION pgmq_delete IS 'Permanently delete a message from the queue';
COMMENT ON FUNCTION pgmq_metrics IS 'Get metrics for a specific PGMQ queue';
COMMENT ON FUNCTION pgmq_metrics_all IS 'Get metrics for all PGMQ queues';
