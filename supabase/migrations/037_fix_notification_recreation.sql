-- 037: Fix notifications being re-created after the user marks them read.
--
-- Root causes fixed here:
--   1. generate_notifications() skipped creation only when an UNREAD row for
--      the same (user, type, reference) existed — so marking a notification
--      read caused the next 6am cron run (or any vendor save, which calls the
--      same function) to insert a fresh unread copy. Dedupe now also honors
--      read rows within a 60-day re-notify window, so cleared notifications
--      stay cleared while genuinely recurring conditions (a COI that expires
--      again next year) still re-alert.
--   2. The past-due filter excluded status 'paid' — a status that does not
--      exist in the invoice lifecycle — so fully paid ('cleared') and voided
--      invoices kept generating past-due alerts forever. Now excludes
--      cleared/disputed/void.
--   3. The function looped per-user per-row with a correlated NOT EXISTS per
--      insert; rewritten set-based so vendor saves (which await this RPC)
--      stay fast.
--
-- Also: collapses historical duplicates (one row per user/type/reference,
-- read-state preserved), marks stale unread alerts read (e.g. past-due
-- notifications for invoices that have since cleared), adds the two indexes
-- the bell query and dedupe need, and unschedules the duplicate 7am cron job
-- that called the now-retired generate-notifications edge function.

-- ---------------------------------------------------------------------------
-- 1. Replace the generator with set-based, read-aware logic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_today date := current_date;
  v_warn30 date := current_date + interval '30 days';
  v_renotify interval := interval '60 days';
  v_count int := 0;
  v_total int := 0;
BEGIN
  -- Shared dedupe rule, applied in every block below: do NOT create a new
  -- notification for (user, type, reference) if one already exists that is
  -- either still unread, or was created within the last 60 days regardless of
  -- read state. Marking read therefore silences it; conditions that persist
  -- or recur re-notify at most every 60 days.

  -- 1. Past-due invoices
  INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read)
  SELECT u.id, 'invoice_past_due', i.id, 'invoice',
         format('Invoice %s from %s ($%s) was due %s and is past due.',
           COALESCE(i.invoice_number, i.id::text),
           COALESCE(i.vendor, 'Unknown Vendor'),
           to_char(COALESCE(i.total_amount, i.amount, 0), 'FM999,999,990.00'),
           i.due_date),
         false
  FROM auth.users u
  CROSS JOIN invoices i
  WHERE i.due_date < v_today
    AND i.status NOT IN ('cleared', 'disputed', 'void')
    AND NOT EXISTS (
      SELECT 1 FROM notifications n2
      WHERE n2.user_id = u.id
        AND n2.type = 'invoice_past_due'
        AND n2.reference_id = i.id
        AND (n2.is_read = false OR n2.created_at > now() - v_renotify)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 2. Invoices pending review
  INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read)
  SELECT u.id, 'invoice_pending_review', i.id, 'invoice',
         format('Invoice %s from %s ($%s) is awaiting review and approval.',
           COALESCE(i.invoice_number, i.id::text),
           COALESCE(i.vendor, 'Unknown Vendor'),
           to_char(COALESCE(i.total_amount, i.amount, 0), 'FM999,999,990.00')),
         false
  FROM auth.users u
  CROSS JOIN invoices i
  WHERE i.status = 'pending_review'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n2
      WHERE n2.user_id = u.id
        AND n2.type = 'invoice_pending_review'
        AND n2.reference_id = i.id
        AND (n2.is_read = false OR n2.created_at > now() - v_renotify)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 3. COI expiring within 30 days
  INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read)
  SELECT u.id, 'coi_expiring', v.id, 'vendor',
         format('%s''s Certificate of Insurance expires on %s (within 30 days). Collect a new COI.',
           v.name, v.coi_expiry_date),
         false
  FROM auth.users u
  CROSS JOIN vendors v
  WHERE v.coi_expiry_date IS NOT NULL
    AND v.coi_expiry_date >= v_today
    AND v.coi_expiry_date <= v_warn30
    AND NOT EXISTS (
      SELECT 1 FROM notifications n2
      WHERE n2.user_id = u.id
        AND n2.type = 'coi_expiring'
        AND n2.reference_id = v.id
        AND (n2.is_read = false OR n2.created_at > now() - v_renotify)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 4. COI expired
  INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read)
  SELECT u.id, 'coi_expired', v.id, 'vendor',
         format('%s''s Certificate of Insurance expired on %s. This vendor is blocked until a new COI is provided.',
           v.name, v.coi_expiry_date),
         false
  FROM auth.users u
  CROSS JOIN vendors v
  WHERE v.coi_expiry_date IS NOT NULL
    AND v.coi_expiry_date < v_today
    AND NOT EXISTS (
      SELECT 1 FROM notifications n2
      WHERE n2.user_id = u.id
        AND n2.type = 'coi_expired'
        AND n2.reference_id = v.id
        AND (n2.is_read = false OR n2.created_at > now() - v_renotify)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 5. License expiring within 30 days
  INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read)
  SELECT u.id, 'license_expiring', v.id, 'vendor',
         format('%s''s contractor license expires on %s (within 30 days). Verify renewal.',
           v.name, v.license_expiry_date),
         false
  FROM auth.users u
  CROSS JOIN vendors v
  WHERE v.license_expiry_date IS NOT NULL
    AND v.license_expiry_date >= v_today
    AND v.license_expiry_date <= v_warn30
    AND NOT EXISTS (
      SELECT 1 FROM notifications n2
      WHERE n2.user_id = u.id
        AND n2.type = 'license_expiring'
        AND n2.reference_id = v.id
        AND (n2.is_read = false OR n2.created_at > now() - v_renotify)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 6. License expired
  INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read)
  SELECT u.id, 'license_expired', v.id, 'vendor',
         format('%s''s contractor license expired on %s. Do not issue new work orders until renewed.',
           v.name, v.license_expiry_date),
         false
  FROM auth.users u
  CROSS JOIN vendors v
  WHERE v.license_expiry_date IS NOT NULL
    AND v.license_expiry_date < v_today
    AND NOT EXISTS (
      SELECT 1 FROM notifications n2
      WHERE n2.user_id = u.id
        AND n2.type = 'license_expired'
        AND n2.reference_id = v.id
        AND (n2.is_read = false OR n2.created_at > now() - v_renotify)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  RETURN jsonb_build_object('ok', true, 'created', v_total);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. One-time cleanup of historical duplicates
-- ---------------------------------------------------------------------------

-- 2a. Before deleting anything, push the group's read-state onto the newest
--     row: if the user EVER read a copy of this notification, the surviving
--     row must be read too (this is exactly the "I cleared it but it came
--     back" complaint).
WITH grp AS (
  SELECT user_id, type, reference_id,
         bool_or(is_read) AS ever_read,
         max(created_at)  AS newest
  FROM notifications
  GROUP BY user_id, type, reference_id
)
UPDATE notifications n
SET is_read = true
FROM grp g
WHERE n.user_id = g.user_id
  AND n.type = g.type
  AND n.reference_id IS NOT DISTINCT FROM g.reference_id
  AND n.created_at = g.newest
  AND g.ever_read
  AND n.is_read = false;

-- 2b. Keep only the newest row per (user, type, reference); delete the rest.
DELETE FROM notifications n
WHERE EXISTS (
  SELECT 1 FROM notifications n2
  WHERE n2.user_id = n.user_id
    AND n2.type = n.type
    AND n2.reference_id IS NOT DISTINCT FROM n.reference_id
    AND (n2.created_at > n.created_at
         OR (n2.created_at = n.created_at AND n2.id > n.id))
);

-- 2c. Mark read any unread alert whose underlying condition no longer holds
--     (e.g. a past-due alert for an invoice that has since cleared, or a COI
--     warning for a vendor whose certificate was renewed or removed).
UPDATE notifications n SET is_read = true
WHERE n.is_read = false
  AND n.type = 'invoice_past_due'
  AND NOT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = n.reference_id
      AND i.due_date < current_date
      AND i.status NOT IN ('cleared', 'disputed', 'void')
  );

UPDATE notifications n SET is_read = true
WHERE n.is_read = false
  AND n.type = 'invoice_pending_review'
  AND NOT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = n.reference_id AND i.status = 'pending_review'
  );

UPDATE notifications n SET is_read = true
WHERE n.is_read = false
  AND n.type = 'coi_expiring'
  AND NOT EXISTS (
    SELECT 1 FROM vendors v
    WHERE v.id = n.reference_id
      AND v.coi_expiry_date IS NOT NULL
      AND v.coi_expiry_date >= current_date
      AND v.coi_expiry_date <= current_date + interval '30 days'
  );

UPDATE notifications n SET is_read = true
WHERE n.is_read = false
  AND n.type = 'coi_expired'
  AND NOT EXISTS (
    SELECT 1 FROM vendors v
    WHERE v.id = n.reference_id
      AND v.coi_expiry_date IS NOT NULL
      AND v.coi_expiry_date < current_date
  );

UPDATE notifications n SET is_read = true
WHERE n.is_read = false
  AND n.type = 'license_expiring'
  AND NOT EXISTS (
    SELECT 1 FROM vendors v
    WHERE v.id = n.reference_id
      AND v.license_expiry_date IS NOT NULL
      AND v.license_expiry_date >= current_date
      AND v.license_expiry_date <= current_date + interval '30 days'
  );

UPDATE notifications n SET is_read = true
WHERE n.is_read = false
  AND n.type = 'license_expired'
  AND NOT EXISTS (
    SELECT 1 FROM vendors v
    WHERE v.id = n.reference_id
      AND v.license_expiry_date IS NOT NULL
      AND v.license_expiry_date < current_date
  );

-- ---------------------------------------------------------------------------
-- 3. Indexes: dedupe lookup + the bell-icon unread query that runs on every
--    page load
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications (user_id, type, reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id, created_at DESC)
  WHERE is_read = false;

-- ---------------------------------------------------------------------------
-- 4. Retire the duplicate generator path: the 7am cron job that invoked the
--    generate-notifications edge function. The 6am 'daily-notifications' job
--    (SELECT generate_notifications()) remains the single scheduled generator;
--    vendor saves also invoke the same function via RPC.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-notification-check') THEN
    PERFORM cron.unschedule('daily-notification-check');
  END IF;
END $$;
