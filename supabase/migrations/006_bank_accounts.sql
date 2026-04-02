CREATE TABLE IF NOT EXISTS bank_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name    text NOT NULL,
  account_name text NOT NULL,
  account_last_four text NOT NULL,
  account_type text NOT NULL DEFAULT 'checking',
  notes        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_accounts_type_check CHECK (account_type IN ('checking', 'savings', 'money_market', 'line_of_credit'))
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage bank accounts" ON bank_accounts
  FOR ALL USING (auth.role() = 'authenticated');
