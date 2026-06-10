-- 041_report_gaap_fixes.sql
-- GAAP fixes for the reporting layer. Read-only report functions — no data
-- changes, no schema changes to existing tables.
--
-- Context (found during the 2026-06 reporting audit):
--   * The 039 get_cash_flow_categorized classified JE siblings by account
--     NUMBER prefixes. That broke on the real chart of accounts:
--       - owner distributions live in 3110/3120 (and a $68k return of capital
--         was posted against 3010), but the old filter looked for '32%' —
--         so distributions fell into the "cash to vendors" bucket.
--       - '22%' caught 2200 "Customer Deposits / Earnest Money", which is NOT
--         a loan account.
--       - only account 1000 was treated as cash; 1010/1020 (subtype 'cash')
--         were invisible to the statement.
--   * The cash flow statement had no beginning/ending cash reconciliation.
--
-- This migration:
--   1. CREATE OR REPLACE get_cash_flow_categorized — same return shape as 039,
--      but classification is driven by chart_of_accounts.subtype/type and the
--      cash pool is every subtype='cash' account. Buckets remain a perfect
--      partition: inflow buckets sum to total cash debits, outflow buckets to
--      total cash credits.
--   2. NEW get_cash_flow_statement — richer bucket set used by the Cash Flow
--      screen + PDF, with beginning/ending cash so the statement reconciles
--      (beginning + net change = ending = GL cash balance).
--   3. NEW get_cash_flow_lines — per-line drill-down carrying the same bucket
--      labels, so the screen's drill rows always sum to the bucket totals.
--
-- Bucket precedence (applied per cash line, mutually exclusive):
--   debits : draw funding (1120 / loan sibling) > equity sibling (owner
--            contribution) > another cash account in the same JE (transfer) >
--            2050 sibling (check returned to outstanding) > other receipts
--   credits: loan sibling (principal payment) > equity sibling (distribution /
--            return of capital) > cash sibling (transfer) > vendor payments
--
-- For a homebuilder, vendor/construction payments are OPERATING (spec homes
-- are inventory under ASC 230); loan draws/repayments and owner capital are
-- FINANCING. The TS layer maps buckets to those sections.

-- ─── 1. Fixed classification, original return shape ──────────────────────────
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
    SELECT jel.journal_entry_id, jel.debit, jel.credit,
           coa.account_number, coa.type, coa.subtype,
           (coa.subtype = 'cash') AS is_cash
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
      COALESCE(bool_or(l.subtype = 'loan') FILTER (WHERE NOT l.is_cash), false) AS has_loan,
      COALESCE(bool_or(l.account_number = '1120') FILTER (WHERE NOT l.is_cash), false) AS has_dfl,
      COALESCE(bool_or(l.type = 'equity') FILTER (WHERE NOT l.is_cash), false) AS has_equity
    FROM lines l
    GROUP BY l.journal_entry_id
  ),
  cash AS (
    SELECT l.debit, l.credit, f.has_loan, f.has_dfl, f.has_equity
    FROM lines l
    JOIN flags f ON f.journal_entry_id = l.journal_entry_id
    WHERE l.is_cash
  )
  SELECT
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit  > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity), 0) AS cash_from_customers,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND NOT c.has_equity), 0)                AS cash_to_vendors,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit  > 0 AND (c.has_dfl OR c.has_loan)), 0)                          AS cash_from_draws,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit  > 0 AND NOT (c.has_dfl OR c.has_loan) AND c.has_equity), 0)     AS capital_contributions,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND c.has_loan), 0)                                         AS loan_payments,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND c.has_equity), 0)                    AS owner_draws
  FROM cash c;
$$;

-- ─── 2. Full cash flow statement buckets + reconciliation ────────────────────
CREATE OR REPLACE FUNCTION get_cash_flow_statement(
  p_start date,
  p_end date
)
RETURNS TABLE (
  operating_receipts numeric,       -- deposits, refunds & other receipts
  check_float_adjustments numeric,  -- DR cash / CR 2050 (check issued, not yet cleared)
  vendor_payments numeric,          -- payments to vendors & subs (construction + overhead)
  draws_received numeric,           -- construction loan draws funded
  owner_contributions numeric,      -- member capital paid in
  loan_principal_payments numeric,  -- principal paid down on loans
  owner_distributions numeric,      -- owner draws / distributions / return of capital
  transfers_in numeric,             -- between own cash accounts (nets to ~0)
  transfers_out numeric,
  beginning_cash numeric,           -- all subtype='cash' accounts, before p_start
  ending_cash numeric               -- all subtype='cash' accounts, through p_end
)
LANGUAGE sql STABLE
AS $$
  WITH lines AS (
    SELECT jel.journal_entry_id, jel.debit, jel.credit,
           coa.account_number, coa.type, coa.subtype,
           (coa.subtype = 'cash') AS is_cash
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
      COALESCE(bool_or(l.subtype = 'loan') FILTER (WHERE NOT l.is_cash), false) AS has_loan,
      COALESCE(bool_or(l.account_number = '1120') FILTER (WHERE NOT l.is_cash), false) AS has_dfl,
      COALESCE(bool_or(l.type = 'equity') FILTER (WHERE NOT l.is_cash), false) AS has_equity,
      COALESCE(bool_or(l.account_number = '2050') FILTER (WHERE NOT l.is_cash), false) AS has_2050,
      COUNT(*) FILTER (WHERE l.is_cash) AS cash_line_count
    FROM lines l
    GROUP BY l.journal_entry_id
  ),
  cash AS (
    SELECT l.debit, l.credit,
           f.has_loan, f.has_dfl, f.has_equity, f.has_2050,
           (f.cash_line_count > 1) AS has_cash_sibling
    FROM lines l
    JOIN flags f ON f.journal_entry_id = l.journal_entry_id
    WHERE l.is_cash
  ),
  recon AS (
    SELECT
      COALESCE(SUM(jel.debit - jel.credit) FILTER (WHERE je.entry_date < p_start), 0)  AS begin_cash,
      COALESCE(SUM(jel.debit - jel.credit) FILTER (WHERE je.entry_date <= p_end), 0)   AS end_cash
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.status = 'posted'
      AND coa.subtype = 'cash'
      AND je.entry_date <= p_end
  )
  SELECT
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND NOT c.has_cash_sibling AND NOT c.has_2050), 0) AS operating_receipts,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND NOT c.has_cash_sibling AND c.has_2050), 0)     AS check_float_adjustments,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND NOT c.has_equity AND NOT c.has_cash_sibling), 0)                                  AS vendor_payments,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND (c.has_dfl OR c.has_loan)), 0)                                                                        AS draws_received,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND c.has_equity), 0)                                                   AS owner_contributions,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND c.has_loan), 0)                                                                                      AS loan_principal_payments,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND c.has_equity), 0)                                                                 AS owner_distributions,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND c.has_cash_sibling), 0)                        AS transfers_in,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND NOT c.has_equity AND c.has_cash_sibling), 0)                                      AS transfers_out,
    (SELECT begin_cash FROM recon) AS beginning_cash,
    (SELECT end_cash FROM recon)   AS ending_cash
  FROM cash c;
$$;

-- ─── 3. Drill-down lines with the same bucket labels ─────────────────────────
CREATE OR REPLACE FUNCTION get_cash_flow_lines(
  p_start date,
  p_end date
)
RETURNS TABLE (
  line_id uuid,
  entry_date date,
  reference text,
  description text,
  bucket text,
  amount numeric  -- signed: debit positive (cash in), credit negative (cash out)
)
LANGUAGE sql STABLE
AS $$
  WITH lines AS (
    SELECT jel.id AS line_id, jel.journal_entry_id, jel.debit, jel.credit,
           jel.description AS line_desc,
           coa.account_number, coa.type, coa.subtype,
           (coa.subtype = 'cash') AS is_cash
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
      COALESCE(bool_or(l.subtype = 'loan') FILTER (WHERE NOT l.is_cash), false) AS has_loan,
      COALESCE(bool_or(l.account_number = '1120') FILTER (WHERE NOT l.is_cash), false) AS has_dfl,
      COALESCE(bool_or(l.type = 'equity') FILTER (WHERE NOT l.is_cash), false) AS has_equity,
      COALESCE(bool_or(l.account_number = '2050') FILTER (WHERE NOT l.is_cash), false) AS has_2050,
      COUNT(*) FILTER (WHERE l.is_cash) AS cash_line_count
    FROM lines l
    GROUP BY l.journal_entry_id
  )
  SELECT
    l.line_id,
    je.entry_date,
    je.reference::text,
    COALESCE(NULLIF(l.line_desc, ''), je.description, '')::text AS description,
    CASE
      WHEN l.debit > 0 AND (f.has_dfl OR f.has_loan) THEN 'draws_received'
      WHEN l.debit > 0 AND f.has_equity THEN 'owner_contributions'
      WHEN l.debit > 0 AND f.cash_line_count > 1 THEN 'transfers_in'
      WHEN l.debit > 0 AND f.has_2050 THEN 'check_float_adjustments'
      WHEN l.debit > 0 THEN 'operating_receipts'
      WHEN l.credit > 0 AND f.has_loan THEN 'loan_principal_payments'
      WHEN l.credit > 0 AND f.has_equity THEN 'owner_distributions'
      WHEN l.credit > 0 AND f.cash_line_count > 1 THEN 'transfers_out'
      ELSE 'vendor_payments'
    END AS bucket,
    (l.debit - l.credit) AS amount
  FROM lines l
  JOIN flags f ON f.journal_entry_id = l.journal_entry_id
  JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE l.is_cash AND (l.debit > 0 OR l.credit > 0)
  ORDER BY je.entry_date DESC, l.line_id;
$$;
