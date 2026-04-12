-- 1. Create loans table
CREATE TABLE IF NOT EXISTS loans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lender_id        uuid NOT NULL REFERENCES contacts(id),
  loan_number      text NOT NULL,
  loan_amount      decimal(12,2) NOT NULL,
  interest_rate    decimal(5,4),
  origination_date date,
  maturity_date    date,
  status           text NOT NULL DEFAULT 'active',
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loans_status_check CHECK (status IN ('active', 'paid_off', 'in_default'))
);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage loans" ON loans
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. Add loan_id to loan_draws (nullable — existing draws have no loan yet)
ALTER TABLE loan_draws ADD COLUMN IF NOT EXISTS loan_id uuid REFERENCES loans(id);
