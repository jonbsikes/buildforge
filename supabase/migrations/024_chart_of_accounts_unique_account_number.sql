-- Migration 024 — UNIQUE constraint on chart_of_accounts.account_number
--
-- Closes finding I15 (Step 11 second-pass audit, Step 16 hardening pass).
--
-- Background:
--   `mintLoanCoaAccount` (banking.ts) reads `max(account_number)` and inserts
--   the next integer. Two parallel `createLoan` calls would read the same
--   max and both insert the same number — silently producing two distinct
--   COA rows that the balance sheet can't tell apart. There is no constraint
--   today preventing it.
--
-- Verification at write-time:
--   SELECT account_number, COUNT(*) FROM chart_of_accounts
--    GROUP BY account_number HAVING COUNT(*) > 1;
--   → 0 rows. Safe to add the unique index without backfill cleanup.
--
-- App-side change:
--   `mintLoanCoaAccount` now retries on unique-violation (Postgres SQLSTATE
--   23505 surfaces in PostgREST as code "23505"), incrementing until the
--   insert succeeds. Bounded retry (10 attempts) to avoid infinite loop on
--   non-conflict errors.

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_account_number_key UNIQUE (account_number);
