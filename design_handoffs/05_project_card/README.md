# BuildForge — Project card redesign

**Handoff to Claude Code · April 2026**

## Overview

The project card is used in ~5 places (dashboard grid, subdivision detail, projects list, search results, attention drilldowns). The current card presents 8 facts at equal weight in a single-column stack, shows a single progress bar that doesn't differentiate exterior vs interior phases, and gives no visual signal for at-risk state. This handoff redesigns the card around a facts hierarchy, two-track stage strip, and left-border accent.

Tied to `§ 04` of `UI Review.html`.

---

## About the Design Files

`UI Review.html § 04` is the **design reference**. Recreate in BuildForge's existing Next.js + Tailwind app. The existing `src/components/projects/ProjectCard.tsx` is the file to rewrite.

---

## Fidelity

**Medium-high.** Layout zones, fact ranking, and stage-strip anatomy are canonical. Exact paddings follow design tokens.

---

## Goals & non-goals

### Goals

1. **Rank facts by importance.** Address + status is primary. Progress + dollars secondary. Plan name + vendor + COI tertiary.
2. **Two-track stage strip** — Exterior track on top, Interior track below. Segments show current, complete, upcoming, delayed states distinctly.
3. **Left-border accent** reflects risk state (red over-budget, orange delayed, blue active, green complete, grey planned).
4. Card variants: default (used in grids), compact (used in lists), expanded (used in subdivision detail).
5. Works for both Home Construction and Land Development projects (different stage sets).

### Non-goals

- The project detail page itself.
- Subdivision-level rollup rows (see `design_handoff_projects_drilldown`).

---

## Card anatomy

```
┌───────────────────────────────────────────────────────┐ ← left border 3px
│  Lot 08 · 7281 S. Douglas                   ● Framing │ ← address + current stage chip
│  Prairie Heights · Plan B-2                           │ ← subdivision · plan (muted)
│                                                        │
│  ████▒░░░░░░  62%    $284k / $310k    −$8k under      │ ← progress · budget actual/target · delta
│                                                        │
│  ▬▬▬▬ EXT  [●][●][●][◐][ ][ ][ ]                      │ ← exterior stage strip
│  ▬▬▬▬ INT  [ ][ ][ ][ ][ ][ ][ ]                      │ ← interior stage strip
│                                                        │
│  ◔ Due Dec 18   ⚠ COI expires in 4d                   │ ← tertiary meta (only when relevant)
└───────────────────────────────────────────────────────┘
```

### Primary row

- **Address/title** (14px semibold, left): `Lot {n} · {street}`. For Land Development rows, this is the Phase name or Subdivision + "Land Development".
- **Current stage chip** (right): status dot + stage name. Background tinted to match state.

### Secondary row

Subdivision name + plan name, muted `#64748B`, 12px.

### Metrics row

Three data points, inline, separated by generous space:

- Progress bar (2px tall, 80px wide) + percent, `tabular-nums`.
- Dollars: `${actual} / ${budget}`, both `tabular-nums`, the actual in `#0F172A`, the budget in `#64748B`.
- Delta: `−$8k under` (green `#10B981`) or `+$12k over` (red `#EF4444`). Signed.

### Stage strip (the big change)

Two horizontal tracks, each 18px tall:

- **EXT** track: 7 segments — Site · Foundation · Framing · Roofing · Siding · Windows · Ext trim
- **INT** track: 7 segments — Rough MEP · Insulation · Drywall · Trim · Paint · Flooring · Finish

Each segment is a pill:

| State | Fill | Text color |
|---|---|---|
| Complete | `#10B981` solid | white |
| Current | outlined with `#4272EF`, inner fill `#E0E7FF` | `#2E5BD8` |
| Upcoming | outlined `#E5E7EB`, no fill | `#9CA3AF` |
| Delayed (should be complete by now but isn't) | `#F97316` solid | white |
| Skipped (e.g. spec home w/o siding) | strikethrough, grey | `#CBD5E1` |

Segment labels are truncated to 3 chars (e.g. "Fra" for Framing) with tooltip on hover showing full name.

Track label ("EXT" / "INT") sits left of the strip in mono eyebrow style.

### For Land Development cards

Single track with these segments:
`Grading · Erosion · Utilities · Roads · Platting · Final Inspection`

Label: `WORK`. Metrics row changes columns:

- Horizontal % complete (weighted by work value)
- Lots sold / total
- $ recognized to date

### Tertiary row (conditional)

Only renders when a fact is relevant:

- Due date chip — outlined, clock icon, "Due Dec 18". Red if past.
- COI expiry warning — outlined, triangle icon, "COI expires in 4d". Amber.
- Permit pending chip — outlined, doc icon, "Permit pending 3d".

If no tertiary facts apply, omit the row entirely — don't render empty space.

---

## Variants

### `compact` — used in lists, search results

- Single row, 52px tall.
- Address · subdivision · current stage dot · progress % · delta.
- No stage strip, no tertiary row.

### `default` — used in grids

Full anatomy above. ~260px wide, 180px tall.

### `expanded` — used in subdivision detail page

- Full anatomy + inline **lot rollup mini-table** beneath the stage strip for subdivisions with children.
- ~320px wide, height grows with content.

---

## Left-border accent rule

3px solid, `border-radius: 12px 0 0 12px`:

| State | Color |
|---|---|
| Any at-risk (over-budget OR delayed OR expiring-COI within 30d) — highest priority among these | Red `#EF4444` if over-budget, else orange `#F97316` if delayed, else amber `#F59E0B` if COI |
| Active (healthy) | Blue `#4272EF` |
| Complete | Green `#10B981` |
| Planned / pre-construction | Grey `#CBD5E1` |

The card's background stays white regardless. Only the border tints.

---

## Interactions & Behavior

- **Click card body** → navigate to project detail page.
- **Click current-stage chip** → scroll to that stage's section on the detail page.
- **Hover a stage segment** → tooltip with full stage name + date started/completed + "{n} days" duration.
- **Click a stage segment** → navigate to detail page scoped to that stage.
- **Focus ring** on the whole card for keyboard navigation.

---

## Design Tokens

- Card bg: white
- Border: 1px `#E5E7EB`, 12px radius (left side overridden by 3px accent)
- Padding: 14px
- Primary text: 14px / 600 / `#0F172A`
- Secondary text: 12px / 400 / `#64748B`
- Stage segment: 22px wide, 18px tall, 4px radius
- Stage strip gap: 3px
- Progress bar: 2px tall, 80px wide, bg `#E5E7EB`, fill `#4272EF`
- Delta positive (under): `#10B981`
- Delta negative (over): `#EF4444`
- Tertiary chip: outlined, 11px text, 4/6px padding, 4px radius

---

## Build order

1. Build the stage-strip component as standalone — it can be used elsewhere too (project detail header).
2. Rewrite `ProjectCard.tsx` with the default variant, hardcoded exterior/interior stage lists.
3. Wire real stage data from `build_stages` table.
4. Add `compact` and `expanded` variants as props.
5. Land Development variant (swap stage list + metrics columns).
6. Tertiary row — conditional render each chip based on data flags.
7. Left-border accent logic based on risk state.
8. Tooltip + click-to-stage nav.

---

## Acceptance criteria

- [ ] A project that is over-budget has a red left border; removing the over-budget state clears it.
- [ ] The Framing stage on an active project shows as the Current segment (outlined blue with light fill), while completed stages before it are solid green.
- [ ] Hovering a stage segment shows a tooltip with the full name and duration.
- [ ] A Land Development card shows one track labeled WORK with horizontal-work stages, not EXT + INT.
- [ ] The compact variant renders at 52px tall with no stage strip.
- [ ] The expanded variant includes a lot rollup sub-table for subdivisions.
- [ ] Tertiary chips only render when their data flag is truthy; otherwise the row is omitted entirely (no empty space).
- [ ] A project with no COI concern and no permit lag shows no tertiary row.
- [ ] The card is keyboard-focusable with a visible focus ring.
- [ ] Delta shows "−$8k under" in green or "+$12k over" in red with correct signs.
