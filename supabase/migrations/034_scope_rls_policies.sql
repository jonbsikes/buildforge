-- 034: Tighten RLS on loans and bank_accounts
-- Previously both tables allowed any authenticated user full access.

-- ============================================================
-- LOANS: scope to user's own projects
-- ============================================================

-- Drop the overly-permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage loans" ON loans;

-- Also drop the older policy from 003_full_schema if it still exists
DROP POLICY IF EXISTS "Users access loans via projects" ON loans;

-- SELECT: user can read loans belonging to their projects
CREATE POLICY "Users can view own project loans" ON loans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = loans.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ALL (insert/update/delete): user can manage loans belonging to their projects
CREATE POLICY "Users can manage own project loans" ON loans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = loans.project_id
        AND projects.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = loans.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ============================================================
-- BANK_ACCOUNTS: add user_id ownership and scope access
-- ============================================================

-- Add user_id column to establish ownership
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill existing rows: assign to the current single user (if any)
UPDATE bank_accounts
  SET user_id = (SELECT id FROM auth.users LIMIT 1)
  WHERE user_id IS NULL;

-- Make user_id NOT NULL going forward
ALTER TABLE bank_accounts
  ALTER COLUMN user_id SET NOT NULL;

-- Drop the overly-permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage bank accounts" ON bank_accounts;

-- SELECT: user can read their own bank accounts
CREATE POLICY "Users can view own bank accounts" ON bank_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- ALL (insert/update/delete): user can manage their own bank accounts
CREATE POLICY "Users can manage own bank accounts" ON bank_accounts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
