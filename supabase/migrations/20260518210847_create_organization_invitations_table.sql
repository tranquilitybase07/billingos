-- Organization invitations: enables inviting users by email before they have an account.
-- The raw token is delivered only via email; the DB stores the SHA-256 hash.
CREATE TABLE
    public.organization_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        token_hash TEXT NOT NULL UNIQUE,
        invited_by UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (
            status IN ('pending', 'accepted', 'revoked', 'expired')
        ),
        expires_at TIMESTAMP
        WITH
            TIME ZONE NOT NULL DEFAULT (NOW () + INTERVAL '7 days'),
            accepted_at TIMESTAMP
        WITH
            TIME ZONE,
            accepted_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
            created_at TIMESTAMP
        WITH
            TIME ZONE NOT NULL DEFAULT NOW (),
            updated_at TIMESTAMP
        WITH
            TIME ZONE NOT NULL DEFAULT NOW ()
    );

CREATE INDEX idx_org_invitations_org ON public.organization_invitations (organization_id);

CREATE INDEX idx_org_invitations_token ON public.organization_invitations (token_hash);

CREATE INDEX idx_org_invitations_email ON public.organization_invitations (lower(email));

CREATE INDEX idx_org_invitations_status ON public.organization_invitations (organization_id, status);

-- One pending invite per (org, email) at any time. Replaces "already invited" check.
CREATE UNIQUE INDEX idx_org_invitations_one_pending ON public.organization_invitations (organization_id, lower(email))
WHERE
    status = 'pending';

CREATE TRIGGER update_organization_invitations_updated_at BEFORE
UPDATE ON public.organization_invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column ();

-- RLS: backend always uses service-role, so policies are restrictive by default.
-- Members can SEE pending invitations for orgs they belong to (Members tab).
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view invitations for their orgs" ON public.organization_invitations FOR
SELECT
    USING (
        EXISTS (
            SELECT
                1
            FROM
                public.user_organizations uo
            WHERE
                uo.organization_id = organization_invitations.organization_id
                AND uo.user_id = auth.uid ()
                AND uo.deleted_at IS NULL
        )
    );

CREATE POLICY "Service role has full access to organization_invitations" ON public.organization_invitations FOR ALL USING (auth.role () = 'service_role');

COMMENT ON TABLE public.organization_invitations IS 'Pending invitations to join an organization. Token is SHA-256 hashed; raw token only in email.';