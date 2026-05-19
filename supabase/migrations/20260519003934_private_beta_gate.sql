-- Private Beta Gate
-- Adds per-user access status + waitlist application payload.
-- The gate itself is toggled by the PRIVATE_BETA_ENABLED env var on
-- the API and web app; this migration only stores state.
CREATE TYPE public.user_access_status AS ENUM ('pending', 'approved', 'denied');

ALTER TABLE public.users
ADD COLUMN access_status public.user_access_status NOT NULL DEFAULT 'pending',
ADD COLUMN beta_application JSONB,
ADD COLUMN access_status_updated_at TIMESTAMP
WITH
    TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_access_status ON public.users (access_status)
WHERE
    deleted_at IS NULL;

-- Backfill: anyone who already has an account predates the gate, so grandfather them in.
UPDATE public.users
SET
    access_status = 'approved',
    access_status_updated_at = NOW ();

COMMENT ON COLUMN public.users.access_status IS 'Private beta gate. pending = new signup, approved = let through, denied = rejected. Only enforced when PRIVATE_BETA_ENABLED is on.';

COMMENT ON COLUMN public.users.beta_application IS 'Optional questionnaire submitted by a pending user to boost approval chances.';

COMMENT ON COLUMN public.users.access_status_updated_at IS 'When access_status last changed.';