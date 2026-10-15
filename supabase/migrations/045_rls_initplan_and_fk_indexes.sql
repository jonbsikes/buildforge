-- 045_rls_initplan_and_fk_indexes.sql
-- Performance pass driven by the Supabase advisor (2026-10-15):
--   * 40 × auth_rls_initplan — every policy called auth.uid() / auth.role() /
--     is_viewer() / is_admin() / current_user_owns_any_project() PER ROW.
--     is_viewer() does a user_profiles lookup, so every report that scans
--     journal_entry_lines paid that cost once per line. Wrapping the call in
--     a scalar sub-select makes Postgres evaluate it once per statement
--     (an InitPlan) instead. Semantics are identical.
--   * 43 × unindexed_foreign_keys — covering indexes for every single-column
--     FK except the legacy gl_entries table.
--   * no_primary_key on rate_limit_entries.
--
-- Applied 2026-10-15 via the Supabase MCP (SQL executor). Section 3 (DROP)
-- is blocked by the MCP's destructive-statement guard — run it from the
-- Supabase SQL editor.

-- ─── 1. Rewrite every policy in place with InitPlan-style auth calls ────────
DO $$
DECLARE r record; q2 text; w2 text; stmt text; n int := 0;
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname='public' LOOP
    q2 := r.qual; w2 := r.with_check;
    IF q2 IS NOT NULL THEN
      q2 := replace(replace(replace(replace(replace(q2,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'is_admin()','(select is_admin())'),'is_viewer()','(select is_viewer())'),'current_user_owns_any_project()','(select current_user_owns_any_project())');
    END IF;
    IF w2 IS NOT NULL THEN
      w2 := replace(replace(replace(replace(replace(w2,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'is_admin()','(select is_admin())'),'is_viewer()','(select is_viewer())'),'current_user_owns_any_project()','(select current_user_owns_any_project())');
    END IF;
    IF (q2 IS DISTINCT FROM r.qual) OR (w2 IS DISTINCT FROM r.with_check) THEN
      stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
      IF q2 IS NOT NULL THEN stmt := stmt || ' USING (' || q2 || ')'; END IF;
      IF w2 IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || w2 || ')'; END IF;
      EXECUTE stmt;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'rewrote % policies', n;
END $$;

-- ─── 2. Covering indexes for single-column foreign keys ─────────────────────
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON public.bank_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_invoice_id ON public.bank_transactions (matched_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_journal_entry_id ON public.bank_transactions (matched_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_user_id ON public.chart_of_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_cost_code_id ON public.contracts (cost_code_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON public.contracts (project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor_id ON public.contracts (vendor_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_gl_account_id ON public.cost_codes (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_credit_applications_applied_by ON public.credit_applications (applied_by);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON public.documents (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_vendor_id ON public.documents (vendor_id);
CREATE INDEX IF NOT EXISTS idx_field_logs_created_by ON public.field_logs (created_by);
CREATE INDEX IF NOT EXISTS idx_field_todos_created_by ON public.field_todos (created_by);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_cost_code ON public.invoice_line_items (cost_code);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON public.invoices (contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cost_code_id ON public.invoices (cost_code_id);
CREATE INDEX IF NOT EXISTS idx_invoices_owner_equity_account_id ON public.invoices (owner_equity_account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_parent_invoice_id ON public.invoices (parent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices (user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON public.journal_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_loan_draws_lender_id ON public.loan_draws (lender_id);
CREATE INDEX IF NOT EXISTS idx_loan_draws_project_id ON public.loan_draws (project_id);
CREATE INDEX IF NOT EXISTS idx_loans_coa_account_id ON public.loans (coa_account_id);
CREATE INDEX IF NOT EXISTS idx_loans_lender_id ON public.loans (lender_id);
CREATE INDEX IF NOT EXISTS idx_loans_project_id ON public.loans (project_id);
CREATE INDEX IF NOT EXISTS idx_payments_owner_equity_account_id ON public.payments (owner_equity_account_id);
CREATE INDEX IF NOT EXISTS idx_payments_vendor_payment_id ON public.payments (vendor_payment_id);
CREATE INDEX IF NOT EXISTS idx_project_cost_codes_cost_code_id ON public.project_cost_codes (cost_code_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON public.project_phases (project_id);
CREATE INDEX IF NOT EXISTS idx_projects_lender_id ON public.projects (lender_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
CREATE INDEX IF NOT EXISTS idx_selections_cost_code_id ON public.selections (cost_code_id);
CREATE INDEX IF NOT EXISTS idx_selections_project_id ON public.selections (project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_journal_entry_id ON public.vendor_credits (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_original_invoice_id ON public.vendor_credits (original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_adjustments_vendor_payment_id ON public.vendor_payment_adjustments (vendor_payment_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_invoices_invoice_id ON public.vendor_payment_invoices (invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_id ON public.vendor_payments (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON public.vendors (user_id);

-- rate_limit_entries had no primary key (advisor: no_primary_key)
ALTER TABLE public.rate_limit_entries ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.rate_limit_entries ADD PRIMARY KEY (id);

-- ─── 3. Drop the redundant viewer_read policy ───────────────────────────────
-- viewer_read (PERMISSIVE SELECT, is_viewer()) duplicates the per-table
-- "Authenticated users access <table>" ALL policy — a viewer is an
-- authenticated user, so it never grants anything extra. Read-only
-- enforcement for viewers comes from the RESTRICTIVE viewer_no_* policies,
-- which stay. Dropping it clears 30 of the advisor's
-- multiple_permissive_policies warnings.
-- NOT YET APPLIED (MCP destructive-statement guard) — run from the SQL editor:
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='viewer_read' LOOP
    EXECUTE format('DROP POLICY viewer_read ON public.%I', r.tablename);
  END LOOP;
END $$;
