-- Create organizations table for business entities

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic information
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(320),
  avatar_url TEXT,
  website VARCHAR(500),

  -- Social media links (array of objects: [{platform: 'twitter', url: '...'}])
  socials JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Business details collected during onboarding
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  details_submitted_at TIMESTAMP WITH TIME ZONE,

  -- Stripe Connect account reference (nullable - created on-demand)
  account_id UUID,

  -- Organization status
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  status_updated_at TIMESTAMP WITH TIME ZONE,
  onboarded_at TIMESTAMP WITH TIME ZONE,

  -- Invoice settings
  customer_invoice_prefix VARCHAR(50) NOT NULL DEFAULT 'INV',
  customer_invoice_next_number INTEGER NOT NULL DEFAULT 1,

  -- Settings (JSONB for flexibility)
  profile_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscription_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_email_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_portal_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_settings JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Feature flags
  subscriptions_billing_engine BOOLEAN NOT NULL DEFAULT false,

  -- Account status
  blocked_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT check_organization_status CHECK (status IN ('created', 'onboarding_started', 'active', 'blocked')),
  CONSTRAINT check_invoice_number_positive CHECK (customer_invoice_next_number > 0)
);

-- Indexes
CREATE UNIQUE INDEX idx_organizations_slug ON public.organizations (slug);
CREATE INDEX idx_organizations_status ON public.organizations (status);
CREATE INDEX idx_organizations_deleted_at ON public.organizations (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_account_id ON public.organizations (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX idx_organizations_created_at ON public.organizations (created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.organizations IS 'Business/merchant organizations that use the platform';
COMMENT ON COLUMN public.organizations.slug IS 'URL-friendly unique identifier for the organization';
COMMENT ON COLUMN public.organizations.details IS 'Business details from onboarding: about, product_description, intended_use, revenue, etc.';
COMMENT ON COLUMN public.organizations.account_id IS 'Reference to Stripe Connect account (created when user sets up payouts)';
COMMENT ON COLUMN public.organizations.status IS 'Organization status: created, onboarding_started, active, blocked';
COMMENT ON COLUMN public.organizations.socials IS 'Array of social media links: [{platform: string, url: string}]';
