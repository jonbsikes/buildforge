-- Add project_id to invoice_line_items so each line item can target a different project.
-- The header-level invoices.project_id remains as the "dominant project" (like cost_code_id).

ALTER TABLE invoice_line_items
  ADD COLUMN project_id uuid REFERENCES projects(id);

-- Backfill: existing line items inherit their parent invoice's project_id
UPDATE invoice_line_items li
SET project_id = inv.project_id
FROM invoices inv
WHERE li.invoice_id = inv.id
  AND inv.project_id IS NOT NULL;

-- Index for queries that filter line items by project
CREATE INDEX idx_invoice_line_items_project_id ON invoice_line_items(project_id);

-- Update RLS policy to allow line items with null project_id (G&A invoices)
-- The existing policy only works when invoices.project_id is not null.
-- Replace with a policy that checks invoice ownership via the invoices table directly.
DROP POLICY IF EXISTS "Users access invoice_line_items via projects" ON invoice_line_items;
DROP POLICY IF EXISTS "Users can view their invoice line items" ON invoice_line_items;
DROP POLICY IF EXISTS "Users can insert their invoice line items" ON invoice_line_items;
DROP POLICY IF EXISTS "Users can update their invoice line items" ON invoice_line_items;
DROP POLICY IF EXISTS "Users can delete their invoice line items" ON invoice_line_items;

CREATE POLICY "Users can view their invoice line items" ON invoice_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
        AND invoices.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their invoice line items" ON invoice_line_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
        AND invoices.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their invoice line items" ON invoice_line_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
        AND invoices.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their invoice line items" ON invoice_line_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
        AND invoices.user_id = auth.uid()
    )
  );
