-- Indexes for GL report queries. journal_entry_lines previously had indexes
-- only on journal_entry_id and loan_id; every report aggregation joins or
-- filters on account_id / project_id / cost_code_id, and all report queries
-- filter journal_entries on (status, entry_date).

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_project_id
  ON journal_entry_lines (project_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id
  ON journal_entry_lines (account_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_cost_code_id
  ON journal_entry_lines (cost_code_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_status_entry_date
  ON journal_entries (status, entry_date);
