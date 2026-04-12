-- ============================================================
-- Migration 002: Schema updates per spec
-- ============================================================

-- 1. Add new columns to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS block              text,
  ADD COLUMN IF NOT EXISTS lot               text,
  ADD COLUMN IF NOT EXISTS lot_size_acres    decimal,
  ADD COLUMN IF NOT EXISTS plan              text,
  ADD COLUMN IF NOT EXISTS home_size_sf      int,
  ADD COLUMN IF NOT EXISTS size_acres        decimal,
  ADD COLUMN IF NOT EXISTS number_of_lots    int,
  ADD COLUMN IF NOT EXISTS number_of_phases  int;

-- estimated_completion_date is auto-calculated, never entered manually
DO $$
BEGIN
  COMMENT ON COLUMN projects.estimated_completion_date
    IS 'Auto-calculated from build stage completion dates. Never entered manually.';
EXCEPTION WHEN undefined_column THEN
  NULL;
END;
$$;

-- 2. Add pending_draw to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS pending_draw boolean NOT NULL DEFAULT false;

-- 3. Unique constraint on cost_codes.code (required for FK from invoice_line_items)
ALTER TABLE cost_codes
  ADD CONSTRAINT cost_codes_code_unique UNIQUE (code);

-- 4. Create invoice_line_items
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  uuid        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  cost_code   text        REFERENCES cost_codes(code),
  description text,
  amount      decimal(12,2),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access invoice_line_items via projects"
  ON invoice_line_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM invoices
      JOIN projects ON projects.id = invoices.project_id
      WHERE invoices.id = invoice_line_items.invoice_id
        AND projects.user_id = auth.uid()
    )
  );

-- 5. Create project_phases
CREATE TABLE IF NOT EXISTS project_phases (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_number     int,
  name             text,
  size_acres       decimal,
  number_of_lots   int,
  lots_sold        int         NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'not_started',
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access project_phases via projects"
  ON project_phases
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = project_phases.project_id
        AND projects.user_id = auth.uid()
    )
  );
