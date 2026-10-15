-- 043: Add a read-only 'viewer' role (e.g. outside CPA).
-- Applied to production 2026-10-15.
--
-- A viewer can SELECT every financial/operational table (including loan, draw,
-- vendor-payment and bank tables that are otherwise owner-scoped) and can never
-- INSERT/UPDATE/DELETE anywhere. Enforcement is at the database via RESTRICTIVE
-- policies, so it holds regardless of the UI or server-action guards.

ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'project_lead'::text, 'project_manager'::text, 'viewer'::text]));

CREATE OR REPLACE FUNCTION public.is_viewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'viewer');
$$;
REVOKE EXECUTE ON FUNCTION public.is_viewer() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename NOT IN ('gmail_sync_state', 'rate_limit_entries', 'notifications', 'user_profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS viewer_read ON public.%I', t);
    EXECUTE format('CREATE POLICY viewer_read ON public.%I FOR SELECT TO authenticated USING (public.is_viewer())', t);
    EXECUTE format('DROP POLICY IF EXISTS viewer_no_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY viewer_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_viewer())', t);
    EXECUTE format('DROP POLICY IF EXISTS viewer_no_update ON public.%I', t);
    EXECUTE format('CREATE POLICY viewer_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_viewer()) WITH CHECK (NOT public.is_viewer())', t);
    EXECUTE format('DROP POLICY IF EXISTS viewer_no_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY viewer_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_viewer())', t);
  END LOOP;
END $$;

-- Viewers cannot change any profile, including their own role.
DROP POLICY IF EXISTS viewer_no_update ON public.user_profiles;
CREATE POLICY viewer_no_update ON public.user_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_viewer()) WITH CHECK (NOT public.is_viewer());
DROP POLICY IF EXISTS viewer_no_delete ON public.user_profiles;
CREATE POLICY viewer_no_delete ON public.user_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_viewer());
