# BuildForge — Projects Drilldown Redesign

**Handoff to Claude Code · April 2026**

## Overview

This handoff implements the largest structural change from the UI Review: replacing the current flat `/projects` accordion with a **5-level drillable tree** (Org → Subdivision → Land Development | Home Construction → Phase → Lot), where every parent row is a live rollup of its children and every node (including Land Development) is itself a first-class project page.

This is the item marked **CRITICAL** in `§ 04b` of the UI Review, and it absorbs several other review items as a consequence (dashboard "Needs Attention" sort-by-risk, project card column choices, the "worst-of-children" propagation pattern).

---

## About the Design Files

The HTML in this bundle is a **design reference**, not production code. It shows intended information architecture, row anatomy, column semantics, and interaction model using inline HTML/CSS — no React, no data layer. **Your job is to recreate these designs inside BuildForge's existing Next.js + Supabase codebase, using its established patterns** (server components for data fetch, client components for interactivity, Tailwind for styling, `StatusDot` / existing primitives where they apply, `lucide-react` for icons, Supabase RLS-respecting queries).

If a pattern shown in the HTML conflicts with BuildForge's conventions (e.g. the mock uses inline styles; BuildForge uses Tailwind), follow BuildForge's conventions. The HTML shows the *shape* of the thing, not its CSS.

---

## Fidelity

**Medium-high fidelity.** The mocks pin exact layouts, column widths, depth-indent rules, rollup math, colors, status mapping, and interaction model. They do **not** pin exact pixel spacing, shadow values, or font weights — apply BuildForge's existing `globals.css` tokens + design spec values where available. Any value specified below (e.g. `3px` left-border accent, `#EF4444`) is canonical — use it exactly.

---

## Goals & non-goals

### Goals

1. Merge the shipped "Home Construction" and "Land Development" top-level sections into a single tree where both are children of a Subdivision.
2. Make every node in the tree drillable: Subdivision, Land Development project, Phase, Lot. Each is linkable via URL and has a detail page.
3. Replace all stored rollup counters with **live-computed** rollups from descendants. No stale numbers, ever.
4. Color parent rows using "worst-of-children" — if any descendant is over-budget, the parent takes on the red accent.
5. Support three real-world project shapes with the same component: full-stack subdivision (develop + build), land-only subdivision (develop + sell lots), and one-off spec home (no subdivision).
6. Make Land Development a first-class project (its own page with budget / permits / vendors / field logs / to-dos / stage track for horizontal work).

### Non-goals (for this PR)

- Dashboard changes (separate handoff item).
- AP/invoices table redesign (separate handoff item).
- Desktop nav rail flyout (separate handoff item).
- Mobile bottom-sheet sub-nav (separate handoff item).
- Migrating existing data schemas — call out what needs to change; don't rip it out here.

---

## Data model changes needed

The current schema has:
- `projects` with `project_type in ('home_construction','land_development')`
- `project_phases` (only for land-dev today)
- `build_stages` per project (home-construction only)
- `subdivision` as a free-text string field on `projects`

The redesign requires:

1. **Subdivisions as a first-class entity** — extract `projects.subdivision` (string) into a `subdivisions` table keyed by name+org. Projects reference it by FK. This is what lets a single Subdivision be the parent of both a land-dev project and multiple home-construction projects.
2. **Land Development projects should reference a Subdivision** the same way Home Construction projects already do (they share `projects.subdivision` today — that's good, just formalize the FK).
3. **Phases should work for both project types.** Today `project_phases` is only populated for land-dev. Home-construction projects should be groupable by a phase too (today they share a `subdivision` but the 6 homes in the screenshot have no phase grouping). Either:
   - Add `phase_id` FK to `projects` (so a home-construction project belongs to a phase within a subdivision), **or**
   - Keep phases only on land-dev and derive home-construction phase membership via a shared `subdivision_id` + ordering. The first option is cleaner.
4. **`project_phases` should hang off `subdivisions`**, not off individual projects. Today a phase is owned by a land-dev project; in the redesign, a phase is owned by the subdivision and both land-dev and home-construction work reference it.

Migration plan should be a separate step before this UI ships. If that's not feasible in one PR, keep the legacy shape and compute the tree on read — slower but no data migration needed to ship the UI.

---

## Screens / Views

### 1. `/projects` — Full tree index

**Purpose:** Single page listing every subdivision and its full hierarchy, collapsible at every level. The default landing when a user clicks "Projects" in the nav.

**Layout:**
- Breadcrumb + filter bar, sticky at top
- One row per node. Indent = depth × 20px, left-border accent indicates worst-of-children state
- Columns (right-aligned on all parent rows):
  - Caret (expand/collapse) · 22px
  - Name + subtitle (flexible)
  - Active count — 90px
  - At-risk count — 90px
  - Progress % — 90px
  - Budget delta — 100px
  - Action link ("Open →") — 60px

**Row variants (all same component, different level):**

- **Org row (depth 0):** Dark background `#0F172A`, white text. Shows all-project rollup. Always rendered when the tree shows multiple subdivisions.
- **Subdivision row (depth 1):** White background, left-border = worst-of-children color. Shows subdivision-level rollups.
  - Includes a **dot-scan strip** under the subdivision name — one dot per lot, colored by lot state (see Status mapping below).
- **Land Development row (depth 2, child of subdivision):** White/tinted background. When clicked, navigates to the Land Development project's detail page. When expanded in-place, reveals phase rows.
- **Home Construction row (depth 2, child of subdivision):** Same component as above. Rollup shows active homes, not lots-for-sale.
- **Phase row (depth 3):** Shows phase-level rollups. Expands to reveal lot rows. In a Land Development subtree, a phase might have 0 active construction but N lots for sale.
- **Lot row (depth 4):** Leaf. Shows status dot, lot number + address, one key fact (stage name, "over budget", "delayed"). Clicking navigates to the lot detail page.

**Realistic tree shapes to support:**

```
A · Prairie Sky  (develop + build)
├─ Land Development    rollup: 32 lots planned · 8 sold · $1.4M recognized
│   ├─ Phase 1 (15 lots · 8 sold · roads + utilities complete)
│   └─ Phase 2 (17 lots · grading in progress · 62% horizontal complete)
└─ Home Construction   rollup: 6 homes active · 0 at risk · 54% weighted
    └─ Phase 1 lots
        ├─ Lot 02 · 7281 S. Douglas · sold + building · 62%
        ├─ Lot 23 · 7181 S. Douglas · sold + building · 48%
        └─ …

B · Northfield Acres  (land-only — you don't build)
└─ Land Development    rollup: 40 lots planned · 12 sold to 3rd-party builders
    ├─ Phase 1 (12 lots · all sold · closed)
    ├─ Phase 2 (14 lots · 0 sold · grading)
    └─ Phase 3 (14 lots · planning)
  (no Home Construction branch)

C · Single spec home  (no subdivision, no land-dev)
└─ Home Construction
    └─ Lot 1 · 412 Elm St · 38% · owner-occupied build
  (no Phase, no Land Development — rendered as a flat row at top level)
```

**Three viewing states (user-selectable via toolbar button):**

1. **Rollup** — collapse all. Shows only subdivision-level summaries. Good for exec / CFO.
2. **Focus** — scoped to one subdivision as root (via breadcrumb click or URL `/projects/prairie-sky`). Shows phases + lots. Good for PM.
3. **Flat / at-risk** — filter by at-risk across the whole tree. Flat list with breadcrumb on each row. Good for superintendent.

### 2. `/projects/[subdivision-slug]` — Subdivision detail

Breadcrumb: `All projects / Prairie Sky`. Shows the subdivision's Land Development and Home Construction children as expanded cards, then Phase rollups below each. Essentially the same component as the full tree but with a subdivision as root.

### 3. `/projects/[subdivision-slug]/land-development` — Land Development project page

**Purpose:** Full project shell for the horizontal work. This is what a PM uses to manage utilities, roads, platting, etc.

**Must match the shell of the existing `/projects/[id]` home-construction detail page** — same header, same sidebar/tab structure, same edit patterns. Differences:

- **Stage track** is horizontal-work stages, not home-construction EXT/INT:
  `Grading → Erosion Control → Utilities → Roads → Platting → Final Inspection`
  Render as a bar-of-segments (see Project Card section in the main UI Review `§ 04`).
- **Sub-projects / content tabs:** Phases (primary), Budget & costs, Permits & approvals, Documents, Vendors, Field logs, To-dos (with count badge).
- **Phase cards** inside are expandable to lot-level detail, where each lot shows sold-state + optional link to a linked home-construction project if one exists on that lot.

### 4. `/projects/[subdivision-slug]/[project-id]` — Home Construction project page

This already exists today as `/projects/[id]`. Under the redesign, the URL carries the subdivision slug for context + breadcrumb. Redirect old `/projects/[id]` URLs to the new path using the subdivision FK.

### 5. `/projects/[subdivision-slug]/phase-[n]` — Phase detail

Scoped view: same tree component with a Phase as root. Shows the lots directly and their parent Land Development / Home Construction rollups.

---

## Row anatomy — canonical spec

Every row, regardless of depth, is rendered by one component. Its props:

```ts
type TreeRow = {
  id: string;
  depth: 0 | 1 | 2 | 3 | 4;
  kind: "org" | "subdivision" | "land-dev" | "home-construction" | "phase" | "lot";
  name: string;
  subtitle?: string;              // e.g. "4 phases · 14 lots"
  expanded: boolean;
  hasChildren: boolean;
  href?: string;                   // if set, row is clickable to navigate
  rollup: {
    activeCount: number;
    atRiskCount: number;
    progressPct: number;           // weighted, see math below
    budgetDelta: number;           // signed dollars
    worstState: "ok" | "delayed" | "over-budget" | "complete";
  };
  // land-dev-specific facets (only on land-dev / phase / lot-for-sale rows)
  landDev?: {
    lotsTotal: number;
    lotsSold: number;
    recognizedRevenue: number;
  };
  // lot-specific
  lot?: {
    statusDot: "sold" | "complete" | "active" | "delayed" | "over-budget" | "planned";
    currentStage?: string;
    buildingFor?: string;          // third-party builder name, or "self"
  };
};
```

**Visual spec per row:**

- Height: 52px for parent rows, 44px for lot rows. Use `--row-h` token.
- Indent: `padding-left: ${depth * 20 + 22}px`
- Left-border accent: `3px solid <worst-state-color>`. If `ok`, no border (transparent).
- Background tint when worst-state is red: `#FEF2F2`. When orange: `#FFFBF5`. Otherwise white.
- Org row override: `bg:#0F172A`, `color:white`, ignore left-border rule.
- Caret: `▾` when expanded, `▸` when collapsed. Color `#6B7280` if has children, `#CBD5E1` if leaf-ish placeholder.
- Name: `font-weight: 600`, `font-size: 14px` for parents, `13px` for phases, `12px` for lots.
- Subtitle: `font-size: 11px`, `color: #9CA3AF`, placed on the same flex line after the name with `margin-left: 4px`.
- Dot-scan strip (subdivision-level only): row of 6×6px dots, `gap:4px`, directly under the name.
- Numeric columns: `tabular-nums`, right-aligned. Signed numbers get color (`#EF4444` for positive/over, `#10B981` for negative/under).
- Action link: `color:#4272EF`, `font-size:11px`, text "Open →" or just "→".

---

## Status dot color mapping

One canonical map. Use these exactly — match the existing `StatusDot` component if present.

| State | Color | When |
|---|---|---|
| Complete | `#10B981` | Project/phase finished, or lot sold+closed |
| Sold | `#10B981` | Lot sold (for-sale lots) |
| Active / In progress | `#4272EF` | Work happening, no issues |
| Delayed | `#F97316` | Scheduled end date in past, work not complete |
| Over-budget | `#EF4444` | Actual cost > budget |
| Warning (review-related) | `#F59E0B` | Pending approval, expiring COI, etc. |
| Planned | `#CBD5E1` | Not yet started |
| Void / Cancelled | `#CBD5E1` (muted label) | Terminal no-op |

**Reserve `#F97316` (orange) strictly for schedule delay.** Use `#F59E0B` (amber) for review-related warnings. Don't cross these — it's one of the issues called out in the UI Review's color section.

---

## Rollup math — the non-negotiable rules

Every parent row computes its numbers live from descendants in the **same query** that hydrates the page. No stored counters. If you need to cache for scale, key the cache by `max(updated_at)` across descendants so it auto-busts.

### activeCount
```
count(descendants where status in ('active', 'pre_construction'))
```

### atRiskCount
```
count(descendants where
   is_over_budget OR
   has_delayed_stage OR
   has_expiring_coi_within_30d)
```
Clicking this number filters the visible children to just the at-risk ones.

### progressPct — **weighted**, never averaged
```
sum(stage_value * child_progress) / sum(stage_value)
```
Where `stage_value` is construction value (`budget` is the easiest proxy). A subdivision with one $600k lot at 90% and five $80k lots at 20% is at ~60%, not 32%.

### budgetDelta
```
sum(actual_cost) - sum(budget)
```
Display as `+$14k over` or `−$3k under`, never just a percent. Signs matter — under and over are read opposite.

### worstState propagation
```
  if any descendant is over-budget    → 'over-budget'
  else if any descendant is delayed   → 'delayed'
  else if all descendants complete    → 'complete'
  else                                → 'ok'
```

This is how a fire in Lot 08 makes the Phase 2 row red, the Prairie Sky row red, and the org header's at-risk count red — all without the user expanding anything.

### Land-dev-specific rollups (replace active/at-risk/progress on land-dev rows)

| Column | Calc |
|---|---|
| Lots total | sum(phases.number_of_lots) |
| Sold | sum(phases.lots_sold) |
| Remaining | total − sold |
| Horizontal complete % | weighted by stage_value across active phases |
| $ recognized | sum(phase.revenue_recognized) |

The column set the row renders is a function of `kind`. A Home Construction row shows active/at-risk/progress/budget. A Land Development row shows sold/remaining/horizontal%/$recognized. The layout grid stays the same — only the labels and sources change.

---

## Interactions & Behavior

### Expand / collapse
- Click on caret or anywhere in the row body (except explicit action links) toggles expand.
- Navigation (clicking "Open →" or `cmd-click` on row) navigates to that node's detail page.
- State persists in `localStorage["projects.open"] = [array of node ids]`.

### Keyboard
- `↓ / ↑` — move focus between visible rows.
- `→` — expand focused row (if has children).
- `←` — collapse focused row; if already collapsed, jump focus to parent.
- `Enter` — navigate to focused row's detail page.
- Focus ring: match existing BuildForge focus ring style.

### Sort
- Default: `atRiskCount desc, budgetDelta desc, progressPct asc`.
- Toolbar sort menu: Risk (default) · Name · Start date · % complete · $ remaining.
- Sort applies within every depth independently (phases inside a subdivision sort by the same axis as subdivisions inside the org).

### Filter
- Search: matches name, address, subdivision, plan, lot number, phase name, vendor name (if denormalized for search).
- Status dropdown: All / Active / At risk / Sold out / Pre-construction / Complete.
- Project-type chip: All · Home Construction only · Land Development only. When Land Development only is active, the tree hides home-construction branches inside each subdivision.

### At-risk click-through
Clicking the at-risk number on any row filters the visible tree to just its at-risk descendants (flat list view). Breadcrumb shows the scope.

### Breadcrumb
- Clickable segments. Clicking a segment navigates to that node as root.
- Segments are: `All projects / <Subdivision> / <Land-Dev | Home-Construction> / <Phase> / <Lot>`.
- URL matches: `/projects` → `/projects/[sub]` → `/projects/[sub]/[land-development | home-construction]` → `/projects/[sub]/[branch]/phase-[n]` → `/projects/[sub]/[branch]/[lot-id]`.

---

## State Management

All reads are server components with Supabase. Expand/collapse state is client-side (zustand or React state persisted to localStorage).

Single-query fetch for the tree (Postgres CTE or nested subqueries):

```sql
-- simplified
with subdivision_rollups as (
  select
    s.id, s.name,
    count(p.id) filter (where p.status = 'active') as active_count,
    count(p.id) filter (where /* at-risk predicate */) as at_risk_count,
    sum(/* weighted progress */) as weighted_progress,
    sum(p.actual_cost) - sum(p.budget) as budget_delta
  from subdivisions s
  left join projects p on p.subdivision_id = s.id
  group by s.id
),
phase_rollups as ( /* similar */ ),
lot_state as ( /* one row per lot with derived status */ )
select …
```

Don't do N+1. One query, one hydration.

---

## Design Tokens

Pull from existing `src/app/globals.css` where available. Values below are canonical where the review specifies them:

### Colors (status)
- `--status-complete: #10B981`
- `--status-active: #4272EF`
- `--status-delayed: #F97316`
- `--status-warning: #F59E0B`
- `--status-over: #EF4444`
- `--status-planned: #CBD5E1`
- `--status-neutral: #64748B`

### Tints (row backgrounds)
- Over-budget tint: `#FEF2F2`
- Delayed tint: `#FFFBF5`
- Land-dev row tint (subtle): `#FFFBF5` with reduced opacity

### Org row
- Background: `#0F172A`
- Muted text on org row: `#94A3B8`

### Depth indent
- Per level: `20px`

### Row height
- Parent rows: `52px`
- Lot rows: `44px`

### Radii / shadows
- Follow the existing BuildForge card style (12px radius for containers, small shadows). Match what's already in `ProjectCard` and `InvoicesTable`.

### Typography
- Use the type scale in `DESIGN-SPEC.md`. Don't invent new sizes. Name: 14px/600. Subtitle: 11px/400. Numerics: `tabular-nums` (you already enforce this elsewhere).

---

## Files in this handoff

| File | What it is |
|---|---|
| `UI Review.html` | The full UI review document — critique + before/after mocks for the entire app. `§ 04b` is the Projects drilldown section this handoff focuses on. |
| `README.md` | This file. |

The HTML mocks live inside `§ 04b` of `UI Review.html`. Specifically:

- The fully-expanded sample (`NEXT · FULLY EXPANDED SAMPLE`) shows the full hierarchy at once. Use this as the canonical layout reference.
- The three viewing states (`ROLLUP · collapse all`, `FOCUS · one subdivision as root`, `FLAT · "Show me everything at risk"`) show how the same component adapts.
- The Land Development detail mock (`NEXT · LAND DEV DETAIL · /projects/prairie-sky/land-development`) shows the full project shell for a Land Development node.

---

## Build order (suggested)

1. **Schema migration** — `subdivisions` table, `phases.subdivision_id` FK. Keep legacy columns until backfilled.
2. **Single `TreeRow` component** — headless first, just layout + props. Verify it renders correctly for all 6 kinds with fake data.
3. **Single query that produces the full tree with rollups** — `getProjectsTree(orgId)` in `lib/projects/tree.ts`.
4. **`/projects` page** — server component fetches, renders tree. Expand/collapse in client wrapper.
5. **Breadcrumb + URL routing** — `/projects/[sub]`, `/projects/[sub]/[branch]`, etc. Same component, scoped root.
6. **Land Development project detail page** — copy the home-construction project shell, swap the stage track to horizontal work, swap column semantics to land-dev.
7. **Sort / filter / search toolbar** — persist selections in URL search params.
8. **Keyboard navigation** — arrow keys, Enter, focus management.
9. **Three viewing states** — toolbar toggle, defaults to full tree.
10. **Dot-scan strip recolor** — map to lot state, add hover tooltip with lot name + status.
11. **localStorage persistence** of expanded node ids.

Each step should ship independently — don't gate the first useful version of the tree on the full feature set.

---

## Acceptance criteria

- [ ] A subdivision with both land-dev and home-construction renders as one row with both as expandable children.
- [ ] A land-only subdivision renders with only a Land Development child; no empty Home Construction branch.
- [ ] A spec home with no subdivision renders as a top-level lot row; no phantom parent.
- [ ] Clicking Phase 2 expands it to show its lots; clicking "Open →" on Phase 2 navigates to `/projects/[sub]/[branch]/phase-2`.
- [ ] Over-budget Lot 08 turns its Phase 2 row, Subdivision row, and Org row red. Removing the over-budget state clears all three.
- [ ] Progress on a subdivision with differently-sized lots is **weighted by budget**, not averaged.
- [ ] Land Development detail page has its own stage track (Grading → Utilities → Roads → Platting → Final Inspection) and its own column set (sold / remaining / $ recognized), not the EXT/INT tracks a home uses.
- [ ] Refreshing the page preserves which nodes were expanded.
- [ ] Sorting by Risk puts at-risk subdivisions first; sorting by Name is alphabetical.
- [ ] `/projects/prairie-sky/phase-2` is a valid bookmarkable URL that renders the same tree rooted at Phase 2.
- [ ] The dot-scan strip under a subdivision shows green for sold, blue for active, orange for delayed, red for over-budget, grey for planned — not just active/complete/other.

---

## Things to carry over to other PRs

The following were flagged in the UI Review but are outside this PR's scope. File them as separate tickets:

- `§ 01` Ship the 280px desktop nav flyout.
- `§ 01b` Mobile tap-active-tab → bottom sheet sub-nav.
- `§ 02` Dashboard: "Needs Attention" as hero, kill "Navigate" card, sort project grid by risk, collapse KPI strip to inline metrics.
- `§ 03` AP table: always-visible Approve column, replace pastel pills with dot+label, consolidate filter row, cost-code name-first.
- `§ 04` Project card: rank facts, two-track stage strip (Exterior + Interior), colored left border for state.
- `§ 05` Badge discipline: two badge types only (status = dot + label; metadata = outlined chip).
