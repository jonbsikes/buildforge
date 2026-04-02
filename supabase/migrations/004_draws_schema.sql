-- Draws span multiple projects (grouped by lender), so project_id must be nullable
ALTER TABLE loan_draws ALTER COLUMN project_id DROP NOT NULL;

-- RLS for loan_draws (no user_id column — use auth.role() guard)
ALTER TABLE loan_draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage draws" ON loan_draws;
CREATE POLICY "Authenticated users can manage draws" ON loan_draws
  FOR ALL USING (auth.role() = 'authenticated');

-- RLS for draw_invoices
ALTER TABLE draw_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage draw_invoices" ON draw_invoices;
CREATE POLICY "Authenticated users can manage draw_invoices" ON draw_invoices
  FOR ALL USING (auth.role() = 'authenticated');

-- RLS for gl_entries
ALTER TABLE gl_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage gl_entries" ON gl_entries;
CREATE POLICY "Authenticated users can manage gl_entries" ON gl_entries
  FOR ALL USING (auth.role() = 'authenticated');
