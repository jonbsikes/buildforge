-- Atomic journal entry posting: inserts header + lines in a single transaction.
-- Validates debits = credits within 0.005 tolerance.
-- Returns the journal_entry id or raises an exception on failure.

CREATE OR REPLACE FUNCTION post_journal_entry(
  p_entry_date date,
  p_reference text,
  p_description text,
  p_status text,
  p_source_type text,
  p_source_id uuid DEFAULT NULL,
  p_loan_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id uuid;
  v_total_debits numeric := 0;
  v_total_credits numeric := 0;
  v_line jsonb;
BEGIN
  -- Validate lines array is not empty
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Journal entry has no lines';
  END IF;

  -- Validate debits = credits
  SELECT
    COALESCE(SUM((line->>'debit')::numeric), 0),
    COALESCE(SUM((line->>'credit')::numeric), 0)
  INTO v_total_debits, v_total_credits
  FROM jsonb_array_elements(p_lines) AS line;

  IF ABS(v_total_debits - v_total_credits) >= 0.005 THEN
    RAISE EXCEPTION 'Journal entry does not balance: debits=% credits=%',
      ROUND(v_total_debits, 2), ROUND(v_total_credits, 2);
  END IF;

  -- Insert header
  INSERT INTO journal_entries (entry_date, reference, description, status, source_type, source_id, loan_id, user_id)
  VALUES (p_entry_date, p_reference, p_description, p_status, p_source_type, p_source_id, p_loan_id, p_user_id)
  RETURNING id INTO v_entry_id;

  -- Insert all lines
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, project_id, cost_code_id, loan_id, description, debit, credit)
  SELECT
    v_entry_id,
    (line->>'account_id')::uuid,
    (line->>'project_id')::uuid,
    (line->>'cost_code_id')::uuid,
    (line->>'loan_id')::uuid,
    line->>'description',
    COALESCE((line->>'debit')::numeric, 0),
    COALESCE((line->>'credit')::numeric, 0)
  FROM jsonb_array_elements(p_lines) AS line;

  RETURN v_entry_id;
END;
$$;
