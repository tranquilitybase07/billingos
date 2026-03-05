-- API Key Authentication Enhancement Migration
-- This migration adds support for secret and publishable API keys
-- with proper type differentiation and security features

-- Create enums for key types and environments
DO $$ BEGIN
    CREATE TYPE api_key_type AS ENUM ('secret', 'publishable');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE api_key_environment AS ENUM ('test', 'live');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to api_keys table
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS key_type api_key_type DEFAULT 'secret',
ADD COLUMN IF NOT EXISTS environment api_key_environment DEFAULT 'test',
ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(10),
ADD COLUMN IF NOT EXISTS key_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS allowed_origins TEXT[],
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Migrate existing keys if any (assume they're all secret test keys)
UPDATE api_keys
SET
    key_type = 'secret',
    environment = 'test',
    key_prefix = CASE
        WHEN key IS NOT NULL THEN SUBSTRING(key, 1, 10)
        ELSE NULL
    END
WHERE key_type IS NULL;

-- If you have existing plain text keys, hash them (one-time migration)
-- WARNING: After this, plain text keys will be lost
-- UPDATE api_keys
-- SET key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex')
-- WHERE key IS NOT NULL AND key_hash IS NULL;

-- Drop the old 'key' column after migration (optional, do this later)
-- ALTER TABLE api_keys DROP COLUMN IF EXISTS key;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix
    ON api_keys(key_prefix);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
    ON api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_env
    ON api_keys(organization_id, environment);

CREATE INDEX IF NOT EXISTS idx_api_keys_revoked
    ON api_keys(revoked_at)
    WHERE revoked_at IS NULL;

-- Add constraint to ensure key_hash is unique
DO $$ BEGIN
    ALTER TABLE api_keys
    ADD CONSTRAINT unique_key_hash UNIQUE (key_hash);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enable RLS on api_keys table
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Organizations can view own API keys" ON api_keys;
DROP POLICY IF EXISTS "Organizations can manage own API keys" ON api_keys;

-- Policy for organizations to view their own keys
CREATE POLICY "Organizations can view own API keys" ON api_keys
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM user_organizations
            WHERE user_id = auth.uid()
        )
    );

-- Policy for admin users to manage API keys
CREATE POLICY "Organizations can manage own API keys" ON api_keys
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM user_organizations
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create function to clean up expired keys (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_api_keys()
RETURNS void AS $$
BEGIN
    UPDATE api_keys
    SET revoked_at = NOW()
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a view for safe API key listing (never exposes hashes)
CREATE OR REPLACE VIEW api_keys_safe AS
SELECT
    id,
    organization_id,
    name,
    key_type,
    environment,
    key_prefix,
    created_at,
    last_used_at,
    expires_at,
    revoked_at,
    allowed_origins,
    metadata,
    CASE
        WHEN revoked_at IS NOT NULL THEN 'revoked'
        WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 'expired'
        ELSE 'active'
    END as status
FROM api_keys;

-- Grant appropriate permissions
GRANT SELECT ON api_keys_safe TO authenticated;

-- Add comment documentation
COMMENT ON TABLE api_keys IS 'Stores API keys for SDK authentication';
COMMENT ON COLUMN api_keys.key_type IS 'Type of key: secret (server-side) or publishable (client-side)';
COMMENT ON COLUMN api_keys.environment IS 'Environment: test or live';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 10 characters of key for identification';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the full API key';
COMMENT ON COLUMN api_keys.allowed_origins IS 'Optional CORS origins restriction for publishable keys';
COMMENT ON COLUMN api_keys.metadata IS 'Additional metadata for the key';
COMMENT ON COLUMN api_keys.revoked_at IS 'Timestamp when key was revoked';
COMMENT ON COLUMN api_keys.expires_at IS 'Optional expiration timestamp';