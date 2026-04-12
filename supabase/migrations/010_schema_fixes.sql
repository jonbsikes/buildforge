-- ============================================================
-- Migration 010: Schema fixes from code audit (April 2026)
-- ============================================================
-- Applied against live DB after discovering the live schema diverged
-- significantly from the local migration files. The live DB already had
-- draw_invoices, gl_entries, selections, notifications, and G&A cost codes
-- 103-120. Only the following were actually missing:
--
--   1. project_cost_codes missing budget_amount and enabled columns
--   2. project_status enum missing 'pre_construction' value
-- ============================================================

-- Fix project_cost_codes: add missing budget_amount and enabled columns
ALTER TABLE project_cost_codes
  ADD COLUMN IF NOT EXISTS budget_amount numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- Add pre_construction to project_status enum
-- Note: must be committed before it can be used in a UPDATE (see 010b)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pre_construction'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'project_status')
  ) THEN
    ALTER TYPE project_status ADD VALUE 'pre_construc