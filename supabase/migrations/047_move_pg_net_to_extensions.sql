-- 047: Move the pg_net extension out of the public schema (advisor: extension_in_public).
-- pg_net does not support ALTER EXTENSION ... SET SCHEMA, so it must be dropped and
-- recreated in the extensions schema. Safe: pg_net's API functions live in the `net`
-- schema either way, so the poll-gmail-invoices cron job calling net.http_post is
-- unaffected, and its request queue is transient (nothing durable is lost).
-- APPLIED 2026-10-16 via the dashboard SQL editor (verified: pg_net now in the
-- extensions schema, net.http_post intact, extension_in_public warning cleared).

BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION pg_net;
CREATE EXTENSION pg_net SCHEMA extensions;
COMMIT;
