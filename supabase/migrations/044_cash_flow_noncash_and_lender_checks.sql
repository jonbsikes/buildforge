-- 044_cash_flow_noncash_and_lender_checks.sql
-- Cash Flow Statement fixes (read-only report functions; no data changes).
--
-- Problems found 2026-10-15 against the live ledger:
--   1. 39 historical entries (CHK-REL-* / CHK-OUT-*) are DR Cash / CR 2050 —
--      lender draw money arriving to cover checks written against the draw.
--      041 bucketed them as "check_float_adjustments" under OPERATING
--      ($82,960). They are FINANCING inflows (loan proceeds). The only other
--      way DR Cash / CR 2050 arises in the app is a VOID reversal of a bank
--      clearing, which must net against vendor payments instead.
--   2. ~$1.17M of financing never touched a cash account: historical
--      invoices posted DR WIP / CR Loan Payable directly, owner-funded costs
--      posted DR WIP / CR Member Capital, and lot-release paydowns posted
--      DR Dev Loan / CR Construction Loan. A direct-method statement built
--      only from cash lines is silent about all of it, so the report showed
--      $437k of draws against $1.65M of loan proceeds. ASC 230-10-50-3
--      requires these as supplemental non-cash investing/financing
--      disclosures.
--
-- Changes:
--   * get_cash_flow_statement: check_float_adjustments column is retained
--     for shape compatibility but now only carries VOID reversals of bank
--     clearings (DR Cash / CR 2050 with reference VOID-%). Everything else
--     DR Cash / CR 2050 moves to a new column lender_funded_checks.
--   * get_cash_flow_lines: same rule, bucket = 'lender_funded_checks'.
--   * NEW get_cash_flow_noncash: supplemental non-cash activity for the
--     period — lender-funded costs, owner-funded costs, loan-to-loan
--     refinancing, and lot cost transfers (CIP → WIP).

-- ─── 1. Statement buckets ────────────────────────────────────────────────────
-- Return shape changes (new lender_funded_checks column), so the 041 version
-- can't be CREATE OR REPLACE'd. Renamed rather than dropped and locked down;
-- safe to DROP in a later cleanup once nothing references it.
ALTER FUNCTION get_cash_flow_statement(date, date) RENAME TO get_cash_flow_statement_v041;
REVOKE EXECUTE ON FUNCTION get_cash_flow_statement_v041(date, date) FROM anon, authenticated, public;
CREATE FUNCTION get_cash_flow_statement(
  p_start date,
  p_end date
)
RETURNS TABLE (
  operating_receipts numeric,       -- vendor refunds, deposit refunds & other receipts
  check_float_adjustments numeric,  -- VOID reversal of a bank clearing (DR cash / CR 2050, ref VOID-%)
  vendor_payments numeric,          -- payments to vendors & subs (construction + overhead)
  draws_received numeric,           -- construction loan draws funded (via 1120 or loan sibling)
  lender_funded_checks numeric,     -- draw cash received to cover outstanding checks (DR cash / CR 2050)
  owner_contributions numeric,      -- member capital paid in
  loan_principal_payments numeric,  -- principal paid down on loans
  owner_distributions numeric,      -- owner draws / distributions / return of capital
  transfers_in numeric,             -- between own cash accounts (nets to ~0)
  transfers_out numeric,
  beginning_cash numeric,           -- all subtype='cash' accounts, before p_start
  ending_cash numeric               -- all subtype='cash' accounts, through p_end
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH lines AS (
    SELECT jel.journal_entry_id, jel.debit, jel.credit,
           coa.account_number, coa.type, coa.subtype,
           (coa.subtype = 'cash') AS is_cash,
           (je.reference ILIKE 'VOID%') AS is_void
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
      bool_or(l.is_void) AS is_void,
      COUNT(*) FILTER (WHERE l.is_cash) AS cash_line_count
    FROM lines l
    GROUP BY l.journal_entry_id
  ),
  cash AS (
    SELECT l.debit, l.credit,
           f.has_loan, f.has_dfl, f.has_equity, f.has_2050, f.is_void,
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
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND NOT c.has_cash_sibling AND NOT c.has_2050), 0)                 AS operating_receipts,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND NOT c.has_cash_sibling AND c.has_2050 AND c.is_void), 0)      AS check_float_adjustments,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND NOT c.has_equity AND NOT c.has_cash_sibling), 0)                                                  AS vendor_payments,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND (c.has_dfl OR c.has_loan)), 0)                                                                                        AS draws_received,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND NOT c.has_cash_sibling AND c.has_2050 AND NOT c.is_void), 0)  AS lender_funded_checks,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND c.has_equity), 0)                                                                   AS owner_contributions,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND c.has_loan), 0)                                                                                                      AS loan_principal_payments,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND c.has_equity), 0)                                                                                 AS owner_distributions,
    COALESCE(SUM(c.debit)  FILTER (WHERE c.debit > 0 AND NOT (c.has_dfl OR c.has_loan) AND NOT c.has_equity AND c.has_cash_sibling), 0)                                        AS transfers_in,
    COALESCE(SUM(c.credit) FILTER (WHERE c.credit > 0 AND NOT c.has_loan AND NOT c.has_equity AND c.has_cash_sibling), 0)                                                      AS transfers_out,
    (SELECT begin_cash FROM recon) AS beginning_cash,
    (SELECT end_cash FROM recon)   AS ending_cash
  FROM cash c;
$$;

-- ─── 2. Drill-down lines ─────────────────────────────────────────────────────
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
SET search_path = public
AS $$
  WITH lines AS (
    SELECT jel.id AS line_id, jel.journal_entry_id, jel.debit, jel.credit,
           jel.description AS line_desc,
           coa.account_number, coa.type, coa.subtype,
           (coa.subtype = 'cash') AS is_cash,
           (je.reference ILIKE 'VOID%') AS is_void
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
      bool_or(l.is_void) AS is_void,
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
      WHEN l.debit > 0 AND f.has_2050 AND f.is_void THEN 'check_float_adjustments'
      WHEN l.debit > 0 AND f.has_2050 THEN 'lender_funded_checks'
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

-- ─── 3. Supplemental non-cash investing & financing activity ─────────────────
-- Per-JE classification of entries with NO cash-account line in the period.
-- Each JE lands in at most one bucket; drill rows carry the same labels.
--
--   lender_funded_costs : CR loan payable with no cash and no 2060/1120 leg
--                         (lender paid the vendor / historical direct posting).
--                         Net of DR loan in the same JE (rounding corrections).
--   owner_funded_costs  : CR member capital with no cash — owner paid a
--                         vendor personally; net of equity debits (voids).
--   loan_refinanced     : DR one loan / CR another (lot-release paydown of
--                         the development loan out of a construction loan).
--   lot_transfers       : DR 1210 WIP / CR 1230 CIP — lot cost moved to a home.
CREATE OR REPLACE FUNCTION get_cash_flow_noncash(
  p_start date,
  p_end date
)
RETURNS TABLE (
  bucket text,
  journal_entry_id uuid,
  entry_date date,
  reference text,
  description text,
  amount numeric
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH je AS (
    SELECT je.id, je.entry_date, je.reference::text AS reference, je.description::text AS description,
      bool_or(coa.subtype = 'cash')                                   AS has_cash,
      bool_or(coa.account_number IN ('2060', '1120'))                 AS has_draw_leg,
      COALESCE(SUM(l.credit) FILTER (WHERE coa.subtype = 'loan'), 0)  AS loan_cr,
      COALESCE(SUM(l.debit)  FILTER (WHERE coa.subtype = 'loan'), 0)  AS loan_dr,
      COALESCE(SUM(l.credit) FILTER (WHERE coa.type = 'equity'), 0)   AS eq_cr,
      COALESCE(SUM(l.debit)  FILTER (WHERE coa.type = 'equity'), 0)   AS eq_dr,
      COALESCE(SUM(l.debit)  FILTER (WHERE coa.account_number = '1210'), 0) AS wip_dr,
      COALESCE(SUM(l.credit) FILTER (WHERE coa.account_number = '1230'), 0) AS cip_cr
    FROM journal_entries je
    JOIN journal_entry_lines l ON l.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = l.account_id
    WHERE je.status = 'posted'
      AND je.entry_date >= p_start
      AND je.entry_date <= p_end
    GROUP BY je.id
  )
  SELECT b.bucket, je.id, je.entry_date, je.reference, je.description, b.amount
  FROM je
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN je.loan_cr > 0 AND je.loan_dr > 0 THEN 'loan_refinanced'
        WHEN je.loan_cr > 0 AND NOT je.has_draw_leg THEN 'lender_funded_costs'
        WHEN je.loan_dr > 0 AND je.loan_cr = 0 AND NOT je.has_draw_leg THEN 'lender_funded_costs'
        WHEN je.eq_cr > 0 OR je.eq_dr > 0 THEN 'owner_funded_costs'
        WHEN je.wip_dr > 0 AND je.cip_cr > 0 THEN 'lot_transfers'
        ELSE NULL
      END AS bucket,
      CASE
        WHEN je.loan_cr > 0 AND je.loan_dr > 0 THEN LEAST(je.loan_cr, je.loan_dr)
        WHEN je.loan_cr > 0 OR je.loan_dr > 0 THEN je.loan_cr - je.loan_dr
        WHEN je.eq_cr > 0 OR je.eq_dr > 0 THEN je.eq_cr - je.eq_dr
        ELSE LEAST(je.wip_dr, je.cip_cr)
      END AS amount
  ) b
  WHERE NOT je.has_cash
    AND b.bucket IS NOT NULL
    AND b.amount <> 0
  ORDER BY je.entry_date DESC, je.reference;
$$;

GRANT EXECUTE ON FUNCTION get_cash_flow_statement(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cash_flow_lines(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cash_flow_noncash(date, date) TO authenticated;
