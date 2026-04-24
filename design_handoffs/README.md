# BuildForge — Claude Code handoff bundle

Seven handoff packages covering the full UI review. Hand these to Claude Code **one at a time** — each is a self-contained PR scope (roughly a few hours to a day of work). Don't bundle them into one session; the context and review loop works better per-PR.

## Suggested order

Ship **design system tightening first** — everything else consumes the primitives and tokens it establishes. Then tackle the rest in whatever priority order makes sense for users.

| # | Package | Section in review | Rough size |
|---|---|---|---|
| 0 | `design_handoff_design_system/` | § 05 | ½ day tokens + primitives, then incremental sweep |
| 1 | `design_handoff_projects_drilldown/` | § 04b | 2–3 days (biggest item — includes a data migration) |
| 2 | `design_handoff_dashboard_rework/` | § 02 | 1 day |
| 3 | `design_handoff_ap_invoices_table/` | § 03 | 1 day |
| 4 | `design_handoff_project_card/` | § 04 | ½ day |
| 5 | `design_handoff_desktop_nav_flyout/` | § 01 | ½ day |
| 6 | `design_handoff_mobile_nav_sheet/` | § 01b | ½ day |

## How to hand one to Claude Code

Each folder contains:
- `README.md` — the spec (self-sufficient, a dev who wasn't in this conversation can implement from it alone).
- `UI Review.html` — the full visual review. Relevant section is referenced at the top of the README.

Unzip in the BuildForge repo root, open Claude Code, and paste something like:

> Read `design_handoff_<name>/README.md` and the referenced section of `UI Review.html`. Confirm the build order + any data-model changes needed, then implement step 1. Stop after each step for review.

## Dependencies between packages

- `design_system` → everything else (tokens/primitives)
- `projects_drilldown` → may touch `project_card` (shared component)
- `dashboard_rework` uses `project_card` (sorted-by-risk grid)
- `mobile_nav_sheet` reuses content map from `desktop_nav_flyout`

If you ship them in the suggested order, dependencies resolve naturally.
