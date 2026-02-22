-- Add version column to subscriptions for optimistic locking
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Add index for version checks
CREATE INDEX IF NOT EXISTS idx_subscriptions_version ON subscriptions(id, version);

-- Add comment
COMMENT ON COLUMN subscriptions.version IS 'Version number for optimistic locking to prevent concurrent updates';