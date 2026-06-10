-- Report aggregation RPCs. All aggregate posted journal entries server-side so
-- report clients/PDFs no longer page the entire journal_entry_lines table to
-- the browser (silently capped at 1,000 rows by PostgREST).
-- Mirrors the pattern established by 035_financial_views.sql.

-- Per-account P&L totals (revenue / cogs / expense) for a date range.
CREATE OR REPLACE FUNCTION get_income_statement_data(
  p_start date,
  p_end date
)
RETURNS TABLE (
  account_number text,
  account_name text,
  account_type text,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    coa.account_number::text,
    coa.name::text AS account_name,
    coa.type::text AS account_type,
    COALESCE(SUM(jel.debit), 0) AS total_debit,
    COALESCE(SUM(jel.credit), 0) AS total_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'posted'
    AND je.entry_date >= p_start
    AND je.entry_date <= p_end
    AND coa.type IN ('revenue', 'cogs', 'expense')
  GROUP BY coa.account_number, coa.name, coa.type
  ORDER BY coa.account_number;
$$;

-- Per-account totals for ALL account types for a date range. Used by the
-- balance-sheet-driven cash flow client and the tax export PDF.
CREATE OR REPLACE FUNCTION get_cash_flow_data(
  p_start date,
  p_end date
)
RETURNS TABLE (
  account_number text,
  account_name text,
  account_type text,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    coa.account_number::text,
    coa.name::text AS account_name,
    coa.type::text AS account_type,
    COALESCE(SUM(jel.debit), 0) AS total_debit,
    COALESCE(SUM(jel.credit), 0) AS total_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'posted'
    AND je.entry_date >= p_start
    AND je.entry_date <= p_end
  GROUP BY coa.account_number, coa.name, coa.type
  ORDER BY coa.account_number;
$$;

-- Cash-basis bucket totals for the cash flow PDF. Reproduces the JE-sibling
-- categorization: each Cash (1000) line is classified by what other accounts
-- appear in the same journal entry.
CREATE OR REPLACE FUNCTION get_cash_flow_categorized(
  p_start date,
  p_end date
)
RETURNS TABLE (
  cash_from_customers numeric,
  cash_to_vendors numeric,
  cash_from_draws numeric,
  capital_contributions numeric,
  loan_payments numeric,
  owner_draws numeric
)
LANGUAGE sql STABLE
AS $$
  WITH lines AS (
    SELECT jel.journal_entry_id, jel.debit, jel.credit, coa.account_number, coa.type
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.status = 'posted'
      AND je.entry_date >= p_start
      AND je.entry_date <= p_end
  ),
  flags AS (
    SELECT
      l.journal_entry_id,
      COALESCE(bool_or(l.account_number LIKE '22%' OR l.account_number = '2100')
        FILTER (WHERE l.account_number <> '1000'), false) AS has_loan_payable,
      COALESCE(bool_or(l.account_number = '1120')
        FILTER (WHERE l.account_number <> '1000'), false) AS has_due_from_lender,
      COALESCE(bool_or(l.account_number LIKE '30%' OR l.type = 'equity')
        FILTER (WHERE l.account_number <> '1000'), false) AS has_equity,
      COALESCE(bool_or(l.account_number LIKE '32%')
        FILTER (WHERE l.account_number <> '1000'), false) AS has_distributions
    FROM lines l
    GROUP BY l.journal_entry_id
  ),
  cash AS (
    SELECT l.debit, l.credit, f.has_loan_payable, f.has_due_from_lender, f.has_equity, f.has_distributions
    FROM lines l
    JOIN flags f ON f.journal_entry_id = l.journal_entry_id
    WHERE l.account_number = '1000'
  )
  SELECT
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0  AND NOT (c.has_due_from_lender OR c.has_loan_payable) AND NOT c.has_equity), 0) AS cash_from_customers,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan_payable AND NOT c.has_distributions), 0) AS cash_to_vendors,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0  AND (c.has_due_from_lender OR c.has_loan_payable)), 0) AS cash_from_draws,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0  AND NOT (c.has_due_from_lender OR c.has_loan_payable) AND c.has_equity), 0) AS capital_contributions,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND c.has_loan_payable), 0) AS loan_payments,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan_payable AND c.has_distributions), 0) AS owner_draws
  FROM cash c;
$$;

-- get_wip_balances with an as-of date cutoff (the 035 version has no date
-- filter). Used by the WIP PDF, which reports as of a chosen date.
CREATE OR REPLACE FUNCTION get_wip_balances_asof(
  p_as_of date DEFAULT CURRENT_DATE,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  project_id uuid,
  account_number text,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    jel.project_id,
    coa.account_number::text,
    COALESCE(SUM(jel.debit), 0) AS total_debit,
    COALESCE(SUM(jel.credit), 0) AS total_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'posted'
    AND je.entry_date <= p_as_of
    AND coa.account_number IN ('1210', '1220', '1230')
    AND jel.project_id IS NOT NULL
    AND (p_project_id IS NULL OR jel.project_id = p_project_id)
  GROUP BY jel.project_id, coa.account_number;
$$;

-- Pure invoice line-item totals per project for approved/released/cleared
-- invoices (WIP report "actual cost" semantics — line items only).
CREATE OR REPLACE FUNCTION get_invoice_line_actuals_by_project()
RETURNS TABLE (
  project_id uuid,
  total_amount numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    li.project_id,
    COALESCE(SUM(li.amount), 0) AS total_amount
  FROM invoice_line_items li
  JOIN invoices i ON i.id = li.invoice_id
  WHERE i.status IN ('approved', 'released', 'cleared')
    AND li.project_id IS NOT NULL
  GROUP BY li.project_id;
$$;

-- Per-project invoice actuals with parent fallback (dashboard semantics):
-- allocate by line items when an invoice has them, otherwise fall back to the
-- invoice's own project and total.
CREATE OR REPLACE FUNCTION get_project_invoice_actuals()
RETURNS TABLE (
  project_id uuid,
  actual_amount numeric
)
LANGUAGE sql STABLE
AS $$
  WITH inv AS (
    SELECT
      i.id,
      i.project_id,
      COALESCE(i.total_amount, i.amount, 0) AS amt,
      EXISTS (SELECT 1 FROM invoice_line_items l WHERE l.invoice_id = i.id) AS has_lines
    FROM invoices i
    WHERE i.status IN ('approved', 'released', 'cleared')
  ),
  line_alloc AS (
    SELECT l.project_id, SUM(l.amount) AS amt
    FROM invoice_line_items l
    JOIN inv ON inv.id = l.invoice_id
    WHERE l.project_id IS NOT NULL
    GROUP BY l.project_id
  ),
  parent_alloc AS (
    SELECT inv.project_id, SUM(inv.amt) AS amt
    FROM inv
    WHERE NOT inv.has_lines AND inv.project_id IS NOT NULL
    GROUP BY inv.project_id
  )
  SELECT x.project_id, COALESCE(SUM(x.amt), 0) AS actual_amount
  FROM (
    SELECT * FROM line_alloc
    UNION ALL
    SELECT * FROM parent_alloc
  ) x
  GROUP BY x.project_id;
$$;

-- Per-vendor invoice stats for the vendors list page.
CREATE OR REPLACE FUNCTION get_vendor_invoice_stats(
  p_year_start date
)
RETURNS TABLE (
  vendor_id uuid,
  ytd_spend numeric,
  open_invoices bigint,
  open_amount numeric,
  last_invoice_date date
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.vendor_id,
    COALESCE(SUM(COALESCE(i.total_amount, i.amount, 0))
      FILTER (WHERE i.status IN ('approved', 'released', 'cleared') AND i.invoice_date >= p_year_start), 0) AS ytd_spend,
    COUNT(*) FILTER (WHERE i.status IN ('approved', 'pending_review', 'released')) AS open_invoices,
    COALESCE(SUM(COALESCE(i.total_amount, i.amount, 0))
      FILTER (WHERE i.status IN ('approved', 'pending_review', 'released')), 0) AS open_amount,
    MAX(i.invoice_date) AS last_invoice_date
  FROM invoices i
  WHERE i.vendor_id IS NOT NULL
  GROUP BY i.vendor_id;
$$;

-- Total budget per project from project_cost_codes (sum of budgeted_amount).
CREATE OR REPLACE FUNCTION get_project_budget_totals()
RETURNS TABLE (
  project_id uuid,
  total_budget numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    pcc.project_id,
    COALESCE(SUM(pcc.budgeted_amount), 0) AS total_budget
  FROM project_cost_codes pcc
  WHERE pcc.project_id IS NOT NULL
  GROUP BY pcc.project_id;
$$;
