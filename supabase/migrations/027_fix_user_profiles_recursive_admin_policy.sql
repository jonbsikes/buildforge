-- The "Admins can manage profiles" policy queried user_profiles inside its own
-- USING clause, causing infinite RLS recursion on every read/write to the table.
-- Postgres aborts with "42P17: infinite recursion detected in policy", which
-- Next.js then masks behind a generic "Server Components render" error.
--
-- Fix: move the admin check into a SECURITY DEFINER function that bypasses RLS.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.user_profiles;

CREATE POLICY "Admins can manage profiles" ON public.user_profiles
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
