-- Create session_tokens table for temporary authentication tokens
-- Session tokens are short-lived (1 hour default), scoped tokens used by frontend SDK
-- They are created by backend after validating merchant's auth, preventing API key exposure

CREATE TABLE IF NOT EXISTS public.session_tokens (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,

  -- Token identity (jti - JWT Token ID for revocation)
  token_id VARCHAR(50) NOT NULL UNIQUE,  -- Unique identifier from token payload

  -- Customer identity (merchant's external IDs)
  external_user_id VARCHAR(255) NOT NULL,  -- Merchant's user ID
  external_organization_id VARCHAR(255),  -- Optional: for B2B use cases

  -- Permissions (operation-level scoping)
  allowed_operations JSONB,  -- Array of allowed operations: ["read_subscription", "update_payment_method"]
  -- NULL means all operations allowed (default)

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- When token expires
  revoked_at TIMESTAMPTZ,  -- Manual revocation (soft delete)
  last_used_at TIMESTAMPTZ,  -- Updated on each API call

  -- Metadata (for security auditing)
  metadata JSONB,  -- Optional: { "ip_address": "203.0.113.45", "user_agent": "...", etc. }

  -- Constraints
  CONSTRAINT valid_external_user CHECK (external_user_id IS NOT NULL AND external_user_id != ''),
  CONSTRAINT valid_expiry CHECK (expires_at > created_at),
  CONSTRAINT valid_revocation CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- Indexes for fast lookups and validation

-- Primary lookup: validate token by token_id (non-revoked tokens)
-- Note: Expiry check done in application code, not index predicate (NOW() is volatile)
CREATE INDEX idx_session_tokens_token_id ON public.session_tokens(token_id)
  WHERE revoked_at IS NULL;

-- Organization queries
CREATE INDEX idx_session_tokens_organization ON public.session_tokens(organization_id, created_at DESC);

-- Customer queries (find all tokens for a user)
CREATE INDEX idx_session_tokens_user ON public.session_tokens(organization_id, external_user_id, created_at DESC);

-- B2B organization queries
CREATE INDEX idx_session_tokens_external_org ON public.session_tokens(organization_id, external_organization_id, created_at DESC)
  WHERE external_organization_id IS NOT NULL;

-- API key tracking
CREATE INDEX idx_session_tokens_api_key ON public.session_tokens(api_key_id, created_at DESC);

-- Expiry cleanup (for automated cleanup jobs)
-- Index on expires_at for efficient cleanup queries
CREATE INDEX idx_session_tokens_expired ON public.session_tokens(expires_at)
  WHERE revoked_at IS NULL;

-- Active tokens lookup (not revoked)
-- Note: Expiry filtering done in query WHERE clause, not index predicate
CREATE INDEX idx_session_tokens_active ON public.session_tokens(organization_id, external_user_id)
  WHERE revoked_at IS NULL;

-- RLS Policies

-- Enable RLS
ALTER TABLE public.session_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Organization admins can view session tokens for audit
CREATE POLICY "Organization admins can view session tokens"
  ON public.session_tokens
  FOR SELECT
  TO authenticated
  USING (
    is_organization_admin(auth.uid(), organization_id)
  );

-- Policy: Service role has full access (backend API operations)
CREATE POLICY "Service role has full access to session tokens"
  ON public.session_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Organization admins can revoke session tokens
CREATE POLICY "Organization admins can revoke session tokens"
  ON public.session_tokens
  FOR UPDATE
  TO authenticated
  USING (
    is_organization_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    is_organization_admin(auth.uid(), organization_id) AND
    revoked_at IS NOT NULL  -- Can only update to revoke
  );

-- Automatic cleanup function for expired tokens (run daily)
-- This keeps the table size manageable by removing old expired tokens

CREATE OR REPLACE FUNCTION cleanup_expired_session_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete tokens that expired more than 7 days ago
  DELETE FROM public.session_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days'
    AND revoked_at IS NULL;

  -- Log cleanup (optional)
  RAISE NOTICE 'Cleaned up expired session tokens older than 7 days';
END;
$$;

-- Comments for documentation
COMMENT ON TABLE public.session_tokens IS 'Stores short-lived session tokens (1 hour default) for frontend SDK authentication. Prevents API key exposure by using temporary, scoped tokens.';
COMMENT ON COLUMN public.session_tokens.token_id IS 'Unique token identifier (jti claim from JWT-like payload). Used for revocation and deduplication.';
COMMENT ON COLUMN public.session_tokens.external_user_id IS 'Merchant''s own user ID (from their auth system). BillingOS scopes all operations to this user.';
COMMENT ON COLUMN public.session_tokens.external_organization_id IS 'Optional: Merchant''s organization ID for B2B use cases. Enables organization-level billing.';
COMMENT ON COLUMN public.session_tokens.allowed_operations IS 'Optional: JSONB array of allowed operations for granular permission control. NULL = all operations allowed.';
COMMENT ON COLUMN public.session_tokens.metadata IS 'Optional: Security metadata like IP address, user agent, etc. for audit trail.';
COMMENT ON COLUMN public.session_tokens.expires_at IS 'When this token expires. Default 1 hour from creation, max 24 hours.';
COMMENT ON COLUMN public.session_tokens.revoked_at IS 'Manual revocation timestamp. Allows merchants to invalidate tokens before expiry.';

-- Schedule cleanup job (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule(
--   'cleanup-expired-session-tokens',
--   '0 2 * * *',  -- Run daily at 2 AM
--   $$SELECT cleanup_expired_session_tokens()$$
-- );
