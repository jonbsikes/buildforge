-- ============================================================
-- User Profiles table with role-based access control
-- Roles: 'admin' (full access), 'project_manager' (read-only financials)
-- ============================================================

CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'project_manager'
    CHECK (role IN ('admin', 'project_manager')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (needed for role checks in the app)
CREATE POLICY "Authenticated users can read profiles"
  ON public.user_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete profiles
CREATE POLICY "Admins can manage profiles"
  ON public.user_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- Users can update their own display_name (but not role)
CREATE POLICY "Users can update own display_name"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Helper function: returns current user's role (used by server actions)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    'project_manager'
  );
$$;

-- Seed Jon's profile as admin
INSERT INTO public.user_profiles (id, display_name, role)
VALUES ('1beee805-988f-4e0c-b1be-12cd0d9b45b2', 'Jon Sikes', 'admin')
ON CONFLICT (id) DO NOTHING;
