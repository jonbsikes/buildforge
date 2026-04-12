-- 011_vendor_payments.sql
-- Tracks individual check payments to vendors from a funded draw.
-- When a draw is marked "funded," one vendor_payment record is created per
-- vendor (grouping all of that vendor's invoices in the draw).  The user
-- then enters a check number / date and clicks "Mark Paid" for each vendor,
-- which posts the AP→Cash GL entry and marks the invoices paid.
-- When every vendor_payment in a draw is paid the draw auto-closes.

-- ============================================================
-- vendor_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_payments (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id       uuid          NOT NULL REFERENCES loan_draws(id) ON DELETE CASCADE,
  vendor_id     uuid          REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name   text          NOT NULL,
  amount        decimal(12,2) NOT NULL,
  check_number  text,
  payment_date  date,
  status        text          NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'paid')),
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- ============================================================
-- vendor_payment_invoices  (join table)
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_payment_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_payment_id   uuid NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  invoice_id          uuid NOT NULL REFERENCES invoices(id)         ON DELETE CASCADE,
  UNIQUE (vendor_payment_id, invoice_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE vendor_payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payment_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_vendor_payments"
  ON vendor_payments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_vendor_payment_invoices"
  ON vendor_payment_invoices FOR ALL TO aut