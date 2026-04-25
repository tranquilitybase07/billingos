-- OAuth Connect support: distinguish Express (platform-created) from Standard (OAuth-connected) accounts.
ALTER TABLE public.accounts
ADD COLUMN stripe_connection_type VARCHAR(20) NOT NULL DEFAULT 'express';

ALTER TABLE public.accounts ADD CONSTRAINT check_stripe_connection_type CHECK (stripe_connection_type IN ('express', 'standard'));

ALTER TABLE public.accounts
ADD COLUMN oauth_stripe_user_id VARCHAR(100);

COMMENT ON COLUMN public.accounts.stripe_connection_type IS 'express = platform-created Express account; standard = merchant-connected via OAuth';

COMMENT ON COLUMN public.accounts.oauth_stripe_user_id IS 'stripe_user_id returned by stripe.oauth.token (audit trail; redundant with stripe_id for standard accounts)';