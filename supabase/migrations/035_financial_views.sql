-- Aggregated balance sheet data: returns account balances from posted journal entries
-- Optionally filtered by project_id (NULL = all projects / company-wide)
CREATE OR REPLACE FUNCTION get_balance_sheet_data(
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  account_number text,
  account_name text,
  account_type text,
  account_subtype text,
  total_debit numeric,
  total_credit numeric,
  project_id uuid,
  project_name text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    coa.account_number,
    coa.name AS account_name,
    coa.type AS account_type,
    coa.subtype AS account_subtype,
    COALESCE(SUM(jel.debit), 0) AS total_debit,
    COALESCE(SUM(jel.credit), 0) AS total_credit,
    jel.project_id,
    p.name AS project_name
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  LEFT JOIN projects p ON p.id = jel.project_id
  WHERE je.status = 'posted'
    AND je.entry_date <= p_as_of_date
    AND coa.is_active IS DISTINCT FROM false
    AND (p_project_id IS NULL OR jel.project_id = p_project_id)
  GROUP BY coa.account_number, coa.name, coa.type, coa.subtype, jel.project_id, p.name
  ORDER BY coa.account_number, p.name;
$$;

-- WIP balances per project for accounts 1210, 1220, 1230
-- Optionally filtered by a single project
CREATE OR REPLACE FUNCTION get_wip_balances(
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
    coa.account_number,
    COALESCE(SUM(jel.debit), 0) AS total_debit,
    COALESCE(SUM(jel.credit), 0) AS total_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'posted'
    AND coa.account_number IN ('1210', '1220', '1230')
    AND jel.project_id IS NOT NULL
    AND (p_project_id IS NULL OR jel.project_id = p_project_id)
  GROUP BY jel.project_id, coa.account_number;
$$;
