-- Internal admin user accounts + immutable audit log for the
-- billingos-admin operations dashboard. Separate from public.users:
-- admin users are BillingOS staff, not merchant operators.
--
CREATE TABLE
    public.admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name VARCHAR(255),
        -- Coarse RBAC; today everyone is 'admin'. 'readonly' reserved for
        -- future contractor / observer accounts.
        role VARCHAR(32) NOT NULL DEFAULT 'admin',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        CONSTRAINT check_admin_role CHECK (role IN ('admin', 'readonly'))
    );

CREATE INDEX idx_admin_users_email_active ON public.admin_users (email)
WHERE
    is_active = true;

CREATE TRIGGER update_admin_users_updated_at BEFORE
UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column ();

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- No policies: service-role only.
COMMENT ON TABLE public.admin_users IS 'Internal BillingOS staff accounts for the admin operations dashboard';

COMMENT ON COLUMN public.admin_users.password_hash IS 'bcrypt hash; never stored or logged in plaintext';

COMMENT ON COLUMN public.admin_users.role IS 'admin = full mutate access; readonly = view-only (future)';

-- Append-only audit trail for every mutation performed via the admin
-- dashboard. The `result` column captures success/failure plus any
-- response data so we can answer "what did we do, and what did Stripe say"
-- months after the fact.
CREATE TABLE
    public.admin_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        admin_user_id UUID REFERENCES public.admin_users (id) ON DELETE SET NULL,
        admin_email VARCHAR(255), -- denormalized so log survives user deletion
        action VARCHAR(100) NOT NULL, -- e.g. 'webhook.replay', 'subscription.reconcile', 'alert.delete'
        resource_type VARCHAR(64), -- e.g. 'webhook_event', 'subscription', 'customer', 'alert'
        resource_id TEXT, -- the row id / stripe id / msg_id
        payload JSONB, -- inputs (sanitized — never include passwords/tokens)
        result JSONB, -- outputs / errors
        -- Forensic context
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
    );

CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);

CREATE INDEX idx_admin_audit_log_admin_user_id ON public.admin_audit_log (admin_user_id, created_at DESC);

CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log (action, created_at DESC);

CREATE INDEX idx_admin_audit_log_resource ON public.admin_audit_log (resource_type, resource_id)
WHERE
    resource_id IS NOT NULL;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies: service-role only. Append-only by convention; updates/deletes
-- are not exposed by the admin app.
COMMENT ON TABLE public.admin_audit_log IS 'Append-only record of every mutation performed via the admin dashboard';

COMMENT ON COLUMN public.admin_audit_log.admin_email IS 'Denormalized so the audit row survives admin_user deletion';

COMMENT ON COLUMN public.admin_audit_log.payload IS 'Sanitized action inputs. NEVER include secrets, passwords, or session tokens';

COMMENT ON COLUMN public.admin_audit_log.result IS 'Outcome: success payload or error details';