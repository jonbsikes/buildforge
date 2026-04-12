ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS loan_type       text           NOT NULL DEFAULT 'term_loan',
  ADD COLUMN IF NOT EXISTS credit_limit    decimal(12,2),
  ADD COLUMN IF NOT EXISTS current_balance decimal(12,2)  DEFAULT 0;

ALTER TABLE loans
  ADD CONSTRAINT loans_loan_type_check
    CHECK (loan_type IN ('term_loan', 'line_of_credit'));
