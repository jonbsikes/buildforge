-- 047: Move the pg_net extension out of the public schema (advisor: extension_in_public).
-- pg_net does not support ALTER EXTENSION ... SET SCHEMA, so it must be dropped and
-- recreated in the extensions schema. Safe: pg_net's API functions live in the `net`
-- schema either way, so the poll-gmail-invoices cron job calling net.http_post is
-- unaffected, and its request queue is transient (nothing durable is lost).
-- NOT YET APPLIED — run this file from the dashboard SQL editor.

BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION pg_net;
CREATE EXTENSION pg_net SCHEMA extensions;
COMMIT;
