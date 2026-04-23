-- Migration 025 — Drop orphan enums left behind by migration 023
--
-- Migration 023 (Step 14) dropped the legacy `sales` and `stages` tables but
-- intentionally left their enum types alone to dodge ordering pain. The types
-- have no remaining references anywhere in the schema — safe to drop now.
--
-- Pre-flight verification:
--   SELECT typname FROM pg_type WHERE typname IN ('sale_type','stage_status')
--     AND typtype = 'e';  → returns both types.
--   Neither type is used as a column type on any current table.

DROP TYPE IF EXISTS public.sale_type;
DROP TYPE IF EXISTS public.stage_status;
