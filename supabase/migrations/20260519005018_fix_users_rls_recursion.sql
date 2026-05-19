-- Fix infinite recursion in public.users RLS policies.
--
-- The original "Admins can view/update all users" policies in
-- 20251230201011_enable_rls_policies.sql query public.users inside their
-- USING clause, which re-evaluates the same policy and recurses. Postgres
-- aborts with: "infinite recursion detected in policy for relation users".
-- This blocks any non-service-role client from reading public.users at all
-- (e.g. Next.js middleware doing a logged-in select).
--
-- Wrap the admin check in a SECURITY DEFINER function so the inner read
-- runs as the function owner and bypasses RLS, breaking the recursion.

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.users WHERE id = auth.uid()),
    FALSE
  );
$$;

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users"
  ON public.users
  FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
CREATE POLICY "Admins can update all users"
  ON public.users
  FOR UPDATE
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());
