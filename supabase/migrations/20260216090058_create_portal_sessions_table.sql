-- Create portal_sessions table for iframe-based customer portal
CREATE TABLE IF NOT EXISTS public.portal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    external_user_id TEXT, -- Optional external user identifier from merchant
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accessed_at TIMESTAMP WITH TIME ZONE, -- Track last access for analytics
    ip_address TEXT, -- Optional IP tracking for security
    user_agent TEXT -- Optional user agent for analytics
);

-- Indexes for performance
CREATE INDEX idx_portal_sessions_customer_id ON public.portal_sessions(customer_id);
CREATE INDEX idx_portal_sessions_organization_id ON public.portal_sessions(organization_id);
CREATE INDEX idx_portal_sessions_expires_at ON public.portal_sessions(expires_at);
CREATE INDEX idx_portal_sessions_created_at ON public.portal_sessions(created_at DESC);

-- Note: Index on expires_at is sufficient for cleanup queries
-- Partial index with WHERE expires_at < now() cannot be created because now() is not immutable

-- Enable RLS
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role can do everything (used by API)
CREATE POLICY "Service role has full access to portal_sessions"
    ON public.portal_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to cleanup expired sessions (optional, can be run via cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_portal_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.portal_sessions
    WHERE expires_at < now();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on table and columns
COMMENT ON TABLE public.portal_sessions IS 'Portal sessions for iframe-based customer portal access';
COMMENT ON COLUMN public.portal_sessions.id IS 'Session ID - acts as bearer token for portal access';
COMMENT ON COLUMN public.portal_sessions.customer_id IS 'Customer who owns this session';
COMMENT ON COLUMN public.portal_sessions.organization_id IS 'Organization that customer belongs to';
COMMENT ON COLUMN public.portal_sessions.external_user_id IS 'External user ID from merchant system';
COMMENT ON COLUMN public.portal_sessions.expires_at IS 'Session expiry time (default 24 hours from creation)';
COMMENT ON COLUMN public.portal_sessions.accessed_at IS 'Last time session was accessed (for analytics)';
