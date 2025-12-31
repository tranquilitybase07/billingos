-- Enable Row Level Security on new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================

-- Policy: Users can view organizations they belong to
CREATE POLICY "Users can view their organizations"
  ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
        AND user_organizations.user_id = auth.uid()
        AND user_organizations.deleted_at IS NULL
    )
  );

-- Policy: Users can create organizations
CREATE POLICY "Users can create organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Only account admins can update organization
CREATE POLICY "Account admins can update organization"
  ON public.organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE accounts.id = organizations.account_id
        AND accounts.admin_id = auth.uid()
    )
    OR
    -- Allow updates if no account exists yet (during onboarding)
    organizations.account_id IS NULL AND
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
        AND user_organizations.user_id = auth.uid()
        AND user_organizations.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE accounts.id = organizations.account_id
        AND accounts.admin_id = auth.uid()
    )
    OR
    organizations.account_id IS NULL AND
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.organization_id = organizations.id
        AND user_organizations.user_id = auth.uid()
        AND user_organizations.deleted_at IS NULL
    )
  );

-- Policy: Only account admins can delete organization
CREATE POLICY "Account admins can delete organization"
  ON public.organizations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE accounts.id = organizations.account_id
        AND accounts.admin_id = auth.uid()
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to organizations"
  ON public.organizations
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- ACCOUNTS POLICIES
-- ============================================================================

-- Policy: Users can view accounts for their organizations
CREATE POLICY "Users can view accounts for their organizations"
  ON public.accounts
  FOR SELECT
  USING (
    -- User is the account admin
    accounts.admin_id = auth.uid()
    OR
    -- User belongs to organization that has this account
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.user_organizations uo ON uo.organization_id = o.id
      WHERE o.account_id = accounts.id
        AND uo.user_id = auth.uid()
        AND uo.deleted_at IS NULL
    )
  );

-- Policy: Users can create accounts
CREATE POLICY "Users can create accounts"
  ON public.accounts
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Only account admin can update account
CREATE POLICY "Account admin can update account"
  ON public.accounts
  FOR UPDATE
  USING (accounts.admin_id = auth.uid())
  WITH CHECK (accounts.admin_id = auth.uid());

-- Policy: Only account admin can delete account
CREATE POLICY "Account admin can delete account"
  ON public.accounts
  FOR DELETE
  USING (accounts.admin_id = auth.uid());

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to accounts"
  ON public.accounts
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- USER_ORGANIZATIONS POLICIES
-- ============================================================================

-- Policy: Users can view their own organization memberships
CREATE POLICY "Users can view their organization memberships"
  ON public.user_organizations
  FOR SELECT
  USING (
    user_organizations.user_id = auth.uid()
    OR
    -- Users can see other members of organizations they belong to
    EXISTS (
      SELECT 1 FROM public.user_organizations uo2
      WHERE uo2.organization_id = user_organizations.organization_id
        AND uo2.user_id = auth.uid()
        AND uo2.deleted_at IS NULL
    )
  );

-- Policy: Users can join organizations (when invited - backend handles invitation logic)
CREATE POLICY "Users can be added to organizations"
  ON public.user_organizations
  FOR INSERT
  WITH CHECK (
    -- User is adding themselves (invitation flow)
    user_organizations.user_id = auth.uid()
    OR
    -- Account admin is adding someone
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.accounts a ON a.id = o.account_id
      WHERE o.id = user_organizations.organization_id
        AND a.admin_id = auth.uid()
    )
  );

-- Policy: Users can leave organizations (soft delete)
CREATE POLICY "Users can leave organizations"
  ON public.user_organizations
  FOR UPDATE
  USING (
    -- User is leaving (soft delete themselves)
    user_organizations.user_id = auth.uid()
    OR
    -- Account admin is removing someone
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.accounts a ON a.id = o.account_id
      WHERE o.id = user_organizations.organization_id
        AND a.admin_id = auth.uid()
    )
  )
  WITH CHECK (
    user_organizations.user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.accounts a ON a.id = o.account_id
      WHERE o.id = user_organizations.organization_id
        AND a.admin_id = auth.uid()
    )
  );

-- Policy: Account admins can remove members
CREATE POLICY "Account admins can remove members"
  ON public.user_organizations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.accounts a ON a.id = o.account_id
      WHERE o.id = user_organizations.organization_id
        AND a.admin_id = auth.uid()
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to user_organizations"
  ON public.user_organizations
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user is organization admin
CREATE OR REPLACE FUNCTION public.is_organization_admin(
  org_id UUID,
  user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.accounts a ON a.id = o.account_id
    WHERE o.id = org_id
      AND a.admin_id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is organization member
CREATE OR REPLACE FUNCTION public.is_organization_member(
  org_id UUID,
  user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE organization_id = org_id
      AND user_id = user_id
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION public.is_organization_admin IS 'Check if user is admin of organization (owns the Stripe Connect account)';
COMMENT ON FUNCTION public.is_organization_member IS 'Check if user is a member of organization';
