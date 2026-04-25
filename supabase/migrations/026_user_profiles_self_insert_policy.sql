-- Allow authenticated users to insert their own profile row.
-- Without this, updateDisplayName fails for users who don't yet have a
-- user_profiles row, since INSERT WITH CHECK had no matching policy.
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
