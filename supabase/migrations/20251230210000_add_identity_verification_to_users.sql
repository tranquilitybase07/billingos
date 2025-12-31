-- Add identity verification fields to users table for Stripe Identity integration

-- Add account_id for Stripe Connect (when user creates their own account)
ALTER TABLE public.users
ADD COLUMN account_id UUID;

-- Add identity verification fields
ALTER TABLE public.users
ADD COLUMN identity_verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
ADD COLUMN identity_verification_id VARCHAR(255) UNIQUE;

-- Create enum-like constraint for verification status
ALTER TABLE public.users
ADD CONSTRAINT check_identity_verification_status
CHECK (identity_verification_status IN ('unverified', 'pending', 'verified', 'failed'));

-- Create index on verification status
CREATE INDEX idx_users_identity_verification_status
ON public.users (identity_verification_status);

-- Create index on verification_id
CREATE INDEX idx_users_identity_verification_id
ON public.users (identity_verification_id)
WHERE identity_verification_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.users.account_id IS 'Reference to Stripe Connect account if user creates one';
COMMENT ON COLUMN public.users.identity_verification_status IS 'Stripe Identity verification status: unverified, pending, verified, failed';
COMMENT ON COLUMN public.users.identity_verification_id IS 'Stripe Identity verification session ID';
