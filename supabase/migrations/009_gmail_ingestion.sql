-- ============================================================
-- Migration 009: Gmail invoice ingestion support
-- ============================================================

-- 1. Add email_message_id for deduplication
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_email_message_id_idx
  ON invoices (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- 2. Add user_id for direct user association (email invoices may have no project)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Back-fill user_id from the owning project for all existing invoices
UPDATE invoices i
SET user_id = p.user_id
FROM projects p
WHERE p.id = i.project_id
  AND i.user_id IS NULL;

-- 4. Replace existing RLS policy to also allow access when user_id matches
--    (handles email-sourced invoices with no project assignment yet)
DROP POLICY IF EXISTS "Users access invoices via projects" ON invoices;

CREATE POLICY "Users access invoices"
  ON invoices
  FOR ALL
  USING (
    (user_id = auth.uid())
    OR (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = invoices.project_id
          AND projects.user_id = auth.uid()
      )
    )
  );
