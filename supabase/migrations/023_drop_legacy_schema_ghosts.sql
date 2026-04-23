-- Migration 023: Drop legacy schema ghosts
--
-- Tables `cost_items`, `stages`, `sales`, `milestones` predate the canonical
-- model (`project_cost_codes` + `cost_codes` for budget/actual; `build_stages`
-- for the construction Gantt). Per CLAUDE.md the canonical model is
-- authoritative — these tables are no longer read or written by any code path
-- after the C10 cleanup (OVERHAUL_PLAN.md Step 14).
--
-- Live row counts at audit time (2026-04-22):
--   cost_items   = 118 rows (stale; canonical project_cost_codes has 410)
--   stages       =   0 rows
--   sales        =   0 rows
--   milestones   =   0 rows
--
-- Dropping `cost_items` discards 118 stale rows. They were never the source of
-- truth for budget vs actual after the canonical model came online — the
-- numbers shown in the live UI come from project_cost_codes / invoices today.
--
-- Defer apply: this migration is committed but NOT yet pushed to the live DB.
-- Apply alongside the merge of overhaul/step-2-gl-helpers, in the same window
-- as migration 022. Smoke-test /reports and /projects/[id]?tab=budget after.
--
-- Related enums also become orphans after this drops:
--   sale_type, stage_status (used only by the dropped tables)
-- They remain in place to avoid ordering pain; a follow-up migration can drop
-- them if desired.

DROP TABLE IF EXISTS public.milestones CASCADE;
DROP TABLE IF EXISTS public.cost_items CASCADE;
DROP TABLE IF EXISTS public.stages CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
