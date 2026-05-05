-- 033_add_missing_indexes.sql
-- Add indexes on frequently-queried foreign key and filter columns
-- to speed up RLS policy checks, joins, and common WHERE clauses.

-- ============================================================
-- Foreign key columns (used in RLS policies and joins)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_project_id
  ON invoices (project_id);

CREATE INDEX IF NOT EXISTS idx_invoices_vendor_id
  ON invoices (vendor_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON invoice_line_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id
  ON journal_entry_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_build_stages_project_id
  ON build_stages (project_id);

CREATE INDEX IF NOT EXISTS idx_field_logs_project_id
  ON field_logs (project_id);

CREATE INDEX IF NOT EXISTS idx_field_todos_project_id
  ON field_todos (project_id);

CREATE INDEX IF NOT EXISTS idx_field_todos_field_log_id
  ON field_todos (field_log_id);

CREATE INDEX IF NOT EXISTS idx_loan_draws_loan_id
  ON loan_draws (loan_id);

CREATE INDEX IF NOT EXISTS idx_draw_invoices_draw_id
  ON draw_invoices (draw_id);

CREATE INDEX IF NOT EXISTS idx_draw_invoices_invoice_id
  ON draw_invoices (invoice_id);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_draw_id
  ON vendor_payments (draw_id);

CREATE INDEX IF NOT EXISTS idx_documents_project_id
  ON documents (project_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications (user_id);

-- ============================================================
-- Status and filter columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices (status);

CREATE INDEX IF NOT EXISTS idx_invoices_pending_draw
  ON invoices (pending_draw);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON invoices (due_date);

CREATE INDEX IF NOT EXISTS idx_loan_draws_status
  ON loan_draws (status);

CREATE INDEX IF NOT EXISTS idx_vendors_coi_expiry_date
  ON vendors (coi_expiry_date);

CREATE INDEX IF NOT EXISTS idx_vendors_license_expiry_date
  ON vendors (license_expiry_date);
