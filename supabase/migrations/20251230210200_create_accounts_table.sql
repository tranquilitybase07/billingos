-- Create accounts table for Stripe Connect accounts

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Account type (for future: could support other payment providers)
  account_type VARCHAR(50) NOT NULL DEFAULT 'stripe',

  -- Admin/owner of the account
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  -- Stripe Connect account details
  stripe_id VARCHAR(100) UNIQUE,  -- Stripe Connect account ID (acct_xxx)
  email VARCHAR(254),
  country VARCHAR(2) NOT NULL,  -- ISO 2-letter country code
  currency VARCHAR(3),  -- ISO 3-letter currency code

  -- Stripe account status/capabilities
  is_details_submitted BOOLEAN NOT NULL DEFAULT false,
  is_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  is_payouts_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Business information
  business_type VARCHAR(255),  -- individual, company, non_profit, government_entity

  -- Account status (mirrors organization status)
  status VARCHAR(50) NOT NULL DEFAULT 'created',

  -- Platform fees (can be customized per account)
  processor_fees_applicable BOOLEAN NOT NULL DEFAULT true,
  platform_fee_percent INTEGER,  -- Basis points (e.g., 500 = 5%)
  platform_fee_fixed INTEGER,    -- Fixed fee in cents

  -- Raw Stripe account data (for debugging and additional fields)
  data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT check_account_type CHECK (account_type IN ('stripe', 'open_collective')),
  CONSTRAINT check_account_status CHECK (status IN ('created', 'onboarding_started', 'active', 'blocked')),
  CONSTRAINT check_country_code CHECK (LENGTH(country) = 2),
  CONSTRAINT check_currency_code CHECK (currency IS NULL OR LENGTH(currency) = 3)
);

-- Indexes
CREATE UNIQUE INDEX idx_accounts_stripe_id ON public.accounts (stripe_id);
CREATE INDEX idx_accounts_admin_id ON public.accounts (admin_id);
CREATE INDEX idx_accounts_status ON public.accounts (status);
CREATE INDEX idx_accounts_deleted_at ON public.accounts (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_created_at ON public.accounts (created_at DESC);

-- Foreign key index for organizations (will be added in next migration)
-- This index helps with JOIN performance when querying organizations by account
CREATE INDEX idx_accounts_id ON public.accounts (id);

-- Trigger for updated_at
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add foreign key to users.account_id (from previous migration)
ALTER TABLE public.users
ADD CONSTRAINT fk_users_account_id
FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE public.accounts IS 'Stripe Connect accounts for organizations and users';
COMMENT ON COLUMN public.accounts.admin_id IS 'User who owns/created this Stripe Connect account';
COMMENT ON COLUMN public.accounts.stripe_id IS 'Stripe Connect account ID (acct_xxx)';
COMMENT ON COLUMN public.accounts.is_details_submitted IS 'Whether user has completed Stripe onboarding form';
COMMENT ON COLUMN public.accounts.is_charges_enabled IS 'Whether account can create charges/accept payments';
COMMENT ON COLUMN public.accounts.is_payouts_enabled IS 'Whether account can receive payouts to bank account';
COMMENT ON COLUMN public.accounts.data IS 'Raw Stripe account object for debugging and additional fields';
COMMENT ON COLUMN public.accounts.platform_fee_percent IS 'Platform fee in basis points (500 = 5%)';
COMMENT ON COLUMN public.accounts.platform_fee_fixed IS 'Fixed platform fee in cents';
