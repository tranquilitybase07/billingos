-- Create api_keys table for organization API authentication
-- This table stores API keys for organizations to authenticate SDK calls
-- Keys are hashed (never stored in plaintext) with signing secrets for HMAC token generation

CREATE TABLE IF NOT EXISTS public.api_keys (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (links to organizations, not "merchants")
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Key metadata
  key_type VARCHAR(20) NOT NULL CHECK (key_type IN ('secret', 'publishable')),
  environment VARCHAR(10) NOT NULL CHECK (environment IN ('live', 'test')),

  -- Key data (security: never store plaintext keys)
  key_prefix VARCHAR(20) NOT NULL,  -- First 13 chars for display (e.g., "sk_live_4fK8n")
  key_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash of full key

  -- Signing secret for HMAC-SHA256 token signatures
  signing_secret TEXT NOT NULL,  -- Base64-encoded 512-bit secret

  -- Optional metadata
  name VARCHAR(255),  -- User-friendly label (e.g., "Production API", "Staging")

  -- Lifecycle tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,  -- Updated on each successful auth
  revoked_at TIMESTAMPTZ,  -- Soft delete for audit trail

  -- Constraints
  CONSTRAINT valid_key_prefix CHECK (
    (key_type = 'secret' AND environment = 'live' AND key_prefix LIKE 'sk_live_%') OR
    (key_type = 'secret' AND environment = 'test' AND key_prefix LIKE 'sk_test_%') OR
    (key_type = 'publishable' AND environment = 'live' AND key_prefix LIKE 'pk_live_%') OR
    (key_type = 'publishable' AND environment = 'test' AND key_prefix LIKE 'pk_test_%')
  )
);

-- Indexes for fast lookups
CREATE INDEX idx_api_keys_organization ON public.api_keys(organization_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_prefix ON public.api_keys(key_prefix);
CREATE INDEX idx_api_keys_type_env ON public.api_keys(organization_id, key_type, environment) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_created_at ON public.api_keys(created_at DESC);

-- RLS Policies

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Organization admins can view their own API keys
CREATE POLICY "Organization admins can view their api keys"
  ON public.api_keys
  FOR SELECT
  TO authenticated
  USING (
    is_organization_admin(auth.uid(), organization_id)
  );

-- Policy: Organization admins can create API keys
CREATE POLICY "Organization admins can create api keys"
  ON public.api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_organization_admin(auth.uid(), organization_id)
  );

-- Policy: Organization admins can revoke their API keys (soft delete via update)
CREATE POLICY "Organization admins can revoke api keys"
  ON public.api_keys
  FOR UPDATE
  TO authenticated
  USING (
    is_organization_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    is_organization_admin(auth.uid(), organization_id)
  );

-- Policy: Service role has full access (for backend API operations)
CREATE POLICY "Service role has full access to api keys"
  ON public.api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.api_keys IS 'Stores API keys for organizations to authenticate SDK and API calls. Keys are hashed (SHA-256) and never stored in plaintext. Signing secrets are used for HMAC-SHA256 session token signatures.';
COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 hash of the full API key. Used for validation without storing plaintext.';
COMMENT ON COLUMN public.api_keys.signing_secret IS 'Base64-encoded 512-bit secret used for HMAC-SHA256 signature generation in session tokens.';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'First 13 characters of the key (e.g., sk_live_4fK8n) for display in dashboard. Safe to show to users.';
COMMENT ON COLUMN public.api_keys.revoked_at IS 'Timestamp when key was revoked. NULL means active. Soft delete for audit trail.';
