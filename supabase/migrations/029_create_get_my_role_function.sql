-- Fix C8: Ensure get_my_role() function exists for src/lib/auth.ts.
-- Returns a jsonb object with {id, display_name, role}.
-- Falls back to defaults if no user_profiles row exists.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('id', id, 'display_name', display_name, 'role', role)
     FROM user_profiles
     WHERE id = auth.uid()),
    jsonb_build_object('id', auth.uid(), 'display_name', 'User', 'role', 'project_manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
