-- Create user_organizations join table for many-to-many relationship

CREATE TABLE public.user_organizations (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Primary key (composite)
  PRIMARY KEY (user_id, organization_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_user_organizations_user_id ON public.user_organizations (user_id);
CREATE INDEX idx_user_organizations_organization_id ON public.user_organizations (organization_id);
CREATE INDEX idx_user_organizations_deleted_at ON public.user_organizations (deleted_at) WHERE deleted_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER update_user_organizations_updated_at
  BEFORE UPDATE ON public.user_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add foreign key to organizations.account_id (now that accounts table exists)
ALTER TABLE public.organizations
ADD CONSTRAINT fk_organizations_account_id
FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE public.user_organizations IS 'Many-to-many relationship between users and organizations (team membership)';
COMMENT ON COLUMN public.user_organizations.user_id IS 'User who is a member of the organization';
COMMENT ON COLUMN public.user_organizations.organization_id IS 'Organization that the user belongs to';
COMMENT ON COLUMN public.user_organizations.deleted_at IS 'Soft delete for maintaining history when user leaves organization';
