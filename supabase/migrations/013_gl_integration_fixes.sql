-- Migration 013: GL Integration Fixes
-- Adds actual_amount column to project_cost_codes for auto-sync from invoices.

-- Add actual_amount to project_cost_codes (defaults to 0)
ALTER TABLE project_cost_codes
  ADD COLUMN IF NOT EXISTS actual_amount decimal(12,2) NOT NULL DEFAULT 0;

-- Add a comment for documentation
COMMENT ON COLUMN project_cost_codes.actual_amount IS
  'Auto-synced from approved/scheduled/paid invoices via syncProjectActualsFr