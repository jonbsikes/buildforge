-- 017_payment_register_enhancements.sql
-- Adds discount_amount column to payments table for early-pay discount tracking.
-- Discounts reduce WIP/CIP and the net check amount.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN payments.discount_amount IS 'Early-pay discount dollar amount. Net check = amount - discount_amount. Discount credits WIP/CIP.';
