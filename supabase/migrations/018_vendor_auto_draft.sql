-- Migration: Flag vendors as auto-drafted
--
-- Some vendors (typically lenders for loan interest) have payments pulled
-- directly from the operating account via ACH auto-draft. For these vendors,
-- the AP screen should surface a "Mark as auto-drafted" option that bypasses
-- the draw / check-issuance workflow and posts a single JE:
--   DR WIP/CIP/G&A Expense / CR Cash (1000)
--
-- This is the vendor-level flag that controls when the auto-draft option
-- appears as a payment choice on an approved invoice. Individual invoices
-- still carry `direct_cash_payment` to record the final decision.

alter table vendors
  add column if not exists auto_draft boolean not null default false;

comment on column vendors.auto_draft is
  'When true, invoices for this vendor surface an "auto-drafted" payment option on the AP row. Used for lenders whose interest payments are ACH-pulled from the operating account.';
