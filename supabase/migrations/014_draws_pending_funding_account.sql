-- Migration 014: Add "Draws Pending Funding" account to chart_of_accounts
--
-- Purpose: Separates the "submitted draw" liability from the actual Loan Payable
-- balance. When a draw is submitted to the lender, we now credit this account
-- (2060) instead of the per-loan Loan Payable accounts. The Loan Payable balance
-- only increases when the draw is actually funded and cash is received.
--
-- Full draw lifecycle after this change:
--   Submit:  DR Due from Lender (1120)           / CR Draws Pending Funding (2060)
--   Fund:    DR Cash (1000)                       / CR Due from Lender (1120)
--            DR Draws Pending Funding (2060)      / CR Loan Payable (220x)
--   Vendor paid: DR AP (2000) / CR Checks Outstanding (2050)
--   Check cleared: DR Checks Outstanding (2050) / CR Cash (1000)

INSERT INTO chart_of_accounts (account_number, name, type, subtype, is_active)
VALUES ('2060', 'Draws Pending Funding', 'liability', 'current', true)
ON CONFLICT (account_numb