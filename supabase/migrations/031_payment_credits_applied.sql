-- 031_payment_credits_applied.sql
-- Adds credits_applied column to payments so the register can show vendor
-- credits applied to a check separately from gross/discount.
-- Net check = amount - discount_amount - credits_applied.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS credits_applied numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN payments.credits_applied IS 'Vendor credits applied to this check. Net check = amount - discount_amount - credits_applied.';
