-- 012_vendor_payment_adjustments.sql
-- Stores individual credit/dispute adjustments against a vendor payment.
-- Each row is a line item with a description and a +/- amount.
-- The parent vendor_payments.amount is kept in sync as adjustments are added.

CREATE TABLE IF NOT EXISTS vendor_payment_adjustments (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_payment_id   uuid          NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  description         text          NOT NULL,
  amount              decimal(12,2) NOT NULL,  -- negative = credit, positive = addition
  created_at          timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE vendor_payment_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_vendor_payment_adjustments"
  ON vendor_payment_adjustments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
