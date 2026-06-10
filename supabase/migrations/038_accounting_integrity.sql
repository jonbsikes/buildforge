-- Accounting integrity helpers (migration 038).
--
-- NOTE: a partial unique index on journal_entries(reference) WHERE status = 'posted'
-- was evaluated as a double-post backstop but intentionally NOT added: live data
-- already contains legitimate duplicate posted references ('Check #ACH' x3,
-- 'CHK-CLR-ACH' x3 — references derived from non-unique user-entered check
-- numbers), so the index would fail to build and would also reject valid future
-- payments that share a check reference.
--
-- NOTE: loan_draws.status is plain text with no CHECK constraint, so the new
-- transient 'funding' status used by fundDraw needs no DDL change.

-- Atomically apply one or more vendor-credit usages. Replaces the racy
-- read-modify-write pattern in server actions (advanceInvoiceStatus,
-- markVendorPaymentPaid). Each UPDATE increments applied_amount in place and
-- is guarded so the credit must still be 'available' with enough remaining
-- balance. Any failure raises, rolling back every increment in the batch.
--
-- p_applications: jsonb array of { "credit_id": uuid, "amount": numeric }
CREATE OR REPLACE FUNCTION apply_vendor_credits(p_applications jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_app jsonb;
  v_amount numeric;
  v_updated int;
BEGIN
  IF p_applications IS NULL OR jsonb_array_length(p_applications) = 0 THEN
    RAISE EXCEPTION 'No credit applications provided';
  END IF;

  FOR v_app IN SELECT * FROM jsonb_array_elements(p_applications) LOOP
    v_amount := (v_app->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Credit application amount must be positive';
    END IF;

    UPDATE vendor_credits
    SET applied_amount = COALESCE(applied_amount, 0) + v_amount,
        status = CASE
          WHEN amount - (COALESCE(applied_amount, 0) + v_amount) < 0.005 THEN 'fully_applied'
          ELSE status
        END
    WHERE id = (v_app->>'credit_id')::uuid
      AND status = 'available'
      AND COALESCE(applied_amount, 0) + v_amount <= amount;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Vendor credit % is unavailable or has insufficient remaining balance',
        v_app->>'credit_id';
    END IF;
  END LOOP;
END;
$$;
