-- Fix C7: Restrict user_profiles self-update to display_name only.
-- The previous policy allowed any authenticated user to update their own role
-- (escalation from project_manager to admin).

DROP POLICY IF EXISTS "Users can update own display_name" ON public.user_profiles;

CREATE POLICY "Users can update own display_name"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT up.role FROM public.user_profiles up WHERE up.id = auth.uid())
  );
