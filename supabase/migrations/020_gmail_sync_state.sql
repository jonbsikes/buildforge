-- ============================================================
-- Migration 020: Gmail incremental sync state + auto-poll schedule
-- ============================================================

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Gmail sync state — singleton row tracking last-polled timestamp.
--    The edge function reads this to build an incremental Gmail query
--    (after:{epoch}) and writes it at the end of each successful run.
--    This prevents re-ingesting emails that were already processed,
--    regardless of Gmail read/unread state.
CREATE TABLE IF NOT EXISTS gmail_sync_state (
  id              INTEGER      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_checked_at TIMESTAMPTZ  NOT NULL DEFAULT (NOW() - INTERVAL '7 days'),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the initial row (first run will process the last 7 days of email)
INSERT INTO gmail_sync_state (id, last_checked_at, updated_at)
VALUES (1, NOW() - INTERVAL '7 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- Edge function accesses this via the service role key (bypasses RLS).
-- Block direct user access so no client can read or tamper with sync state.
ALTER TABLE gmail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON gmail_sync_state
  FOR ALL TO authenticated USING (false);

-- 2. Schedule the Gmail poll to run automatically every 15 minutes.
--    Uses the same pg_cron + net.http_post pattern as the existing
--    daily-notification-check job (migration 006).
SELECT cron.schedule(
  'poll-gmail-invoices',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://wuykwjxlhimmxwuwwhsw.supabase.co/functions/v1/poll-gmail-invoices',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := '{}'::jsonb
    )
  $$
);
