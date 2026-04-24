# BuildForge — Dashboard rework

**Handoff to Claude Code · April 2026**

## Overview

The current dashboard leads with a static "Navigate" card that every user sees every day, hides at-risk items in a small side panel, buries the KPI strip, and presents the project grid in insertion order. This handoff rebuilds it around **"what needs my attention today"** — pushing work, not navigation, to the top.

Tied to `§ 02` of `UI Review.html`.

---

## About the Design Files

`UI Review.html § 02` is the **design reference** showing the rebuilt dashboard. Recreate in BuildForge's existing Next.js + Tailwind app. The existing `src/app/(dashboard)/page.tsx` (or equivalent) is where this lands.

---

## Fidelity

**Medium-high.** Content blocks, their order, and prioritization rules are canonical. Exact spacing follows existing design tokens.

---

## Goals & non-goals

### Goals

1. Make "Needs Attention" the hero of the dashboard, not a sidebar.
2. Delete the "Navigate" card entirely.
3. Sort the project grid by risk (descending), not insertion order.
4. Collapse the KPI strip into a slim inline metrics row directly beneath the greeting.
5. Surface pending approvals and stalled items directly on the dashboard — one tap to act, not navigate.

### Non-goals

- Changing the project card itself (see separate handoff `design_handoff_project_card`).
- Changing the AP table that lives on the AP page, not the dashboard.

---

## Screens / Views

### New dashboard layout (top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│ Morning, Jon                            4 need attention    │  ← greeting + global at-risk count
├─────────────────────────────────────────────────────────────┤
│ 12 active  ·  $4.3M in flight  ·  $82k AP this week  ·  2  │  ← slim metrics row
│ draws pending                                               │
├─────────────────────────────────────────────────────────────┤
│  NEEDS ATTENTION                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🔴  Lot 08 · Prairie Heights                         │  │
│  │     Over budget by $12k · framing                    │  │
│  │                             Review →   Dismiss       │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 🟠  Invoice #1847 · Rocky Mtn Lumber                 │  │
│  │     Pending approval · 3 days                        │  │
│  │                             Approve   Open           │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 🟠  Lot 23 · Prairie Heights                         │  │
│  │     Foundation delayed 5 days                        │  │
│  │                             Open →                   │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ACTIVE PROJECTS                    Sort: Risk ▾   Grid/List│
│  [ProjectCard] [ProjectCard] [ProjectCard]                  │
│  [ProjectCard] [ProjectCard] [ProjectCard]                  │
└─────────────────────────────────────────────────────────────┘
```

### 1. Greeting + at-risk count

- "Morning, {firstName}" / "Afternoon, {firstName}" / "Evening, {firstName}" based on local time.
- 24px, semibold.
- Right-aligned counter: "4 need attention". Clicking scrolls to Needs Attention section. Red dot if count > 0.

### 2. Slim metrics row

One line, inline, separated by `·`. Values in `tabular-nums`, labels in muted color.

- `{active_count} active` · `${in_flight_total} in flight` · `${ap_this_week} AP this week` · `{draws_pending_count} draws pending`

No cards, no charts, no sparklines. Pure text, 14px, color `#334155`.

### 3. Needs Attention section (the hero)

- Section label: eyebrow style, `JetBrains Mono` 10px uppercase, color `#64748B`.
- Stack of attention cards, max 8 visible with "Show more" if there are more.
- Each card:
  - Status dot (red for over-budget, orange for delayed, amber for pending approval).
  - Title: "{Lot or Invoice #} · {subdivision or vendor}".
  - Subtitle: one-sentence description of the problem.
  - Actions on the right — primary action inline (Approve, Review), secondary action (Open / Dismiss) as text link.
- Clicking the card body navigates to the item's detail page. Clicking an inline action performs that action without leaving the dashboard.

**Sort order:** over-budget > delayed > pending-approval > expiring-COI. Within each bucket, most recent updated_at first.

**Cap at 8.** If more, show "Show all X →" link that navigates to `/projects?filter=at-risk` (the flat view from the Projects drilldown handoff).

### 4. Active Projects grid

- Same project card as today, but sorted by **risk score** descending by default.
- Risk score: `over_budget * 3 + delayed_stage_count * 2 + expiring_coi_count + pending_approval_count`.
- Toolbar controls: sort dropdown (Risk / Name / Start date / % complete), view toggle (Grid / List), subdivision filter chip.
- User-chosen sort persists in `localStorage["dashboard.sort"]`.
- Grid: 3 cols @ ≥1280px, 2 cols @ ≥768px, 1 col mobile.

---

## Interactions & Behavior

### Attention card inline actions

- **Approve** (on pending-invoice cards): posts to the existing `/api/invoices/[id]/approve` endpoint. On success, card slides out + count decrements. On failure, toast + card stays.
- **Dismiss** (on over-budget cards): marks the alert as acknowledged for 24h — doesn't fix the problem, just hides it. Server writes `attention_dismissed_until = now() + interval '24 hours'`.
- **Review / Open**: navigates to the relevant detail page.

### Removing "Navigate" card

Just delete it. The rail + flyout handles navigation. If the current dashboard has a "Quick actions" block wrapped into that card, split the 2–3 most-used actions into a small toolbar in the top-right of the dashboard ("New project", "Add invoice").

---

## Data

### Greeting count + attention list (one query)

```sql
-- Attention items — union all sources
(select
  'over_budget' as kind,
  p.id as target_id,
  p.name || ' · ' || p.subdivision_name as title,
  'Over budget by $' || ((p.actual_cost - p.budget) / 1000) || 'k · ' || p.current_stage_name as subtitle,
  p.updated_at,
  3 as priority
 from projects p
 where p.org_id = :orgId and p.actual_cost > p.budget
   and (p.attention_dismissed_until is null or p.attention_dismissed_until < now()))

union all

(select 'delayed', p.id, p.name || ' · ' || p.subdivision_name,
        p.current_stage_name || ' delayed ' || (extract(day from now() - p.current_stage_due_date)) || ' days',
        p.updated_at, 2
 from projects p
 where p.org_id = :orgId and p.current_stage_due_date < now() and p.current_stage_complete = false)

union all

(select 'pending_approval', i.id, 'Invoice #' || i.number || ' · ' || i.vendor_name,
        'Pending approval · ' || (extract(day from now() - i.submitted_at)) || ' days',
        i.submitted_at, 1
 from invoices i
 where i.org_id = :orgId and i.status = 'pending_approval')

order by priority desc, updated_at desc
limit 8;
```

### Metrics row

```sql
select
  count(*) filter (where status = 'active') as active_count,
  sum(budget) filter (where status = 'active') as in_flight_total,
  (select sum(amount) from invoices where status in ('pending','approved')
     and due_date between now() and now() + interval '7 days' and org_id = :orgId) as ap_this_week,
  (select count(*) from draws where status = 'pending' and org_id = :orgId) as draws_pending
from projects where org_id = :orgId;
```

### Project grid — risk-sorted

```sql
select p.*,
  (case when p.actual_cost > p.budget then 3 else 0 end
   + case when p.current_stage_due_date < now() and not p.current_stage_complete then 2 else 0 end
   + (select count(*) from vendor_cois c where c.project_id = p.id and c.expires_at < now() + interval '30 days')
  ) as risk_score
from projects p
where p.org_id = :orgId and p.status = 'active'
order by risk_score desc, p.updated_at desc;
```

---

## Design Tokens

- Greeting: 24px / semibold / `#0F172A`.
- At-risk badge: 13px / `#EF4444` bg at 10% opacity, red text.
- Metrics row: 14px / `#334155` / `tabular-nums`.
- Attention section eyebrow: 10px / uppercase / `JetBrains Mono` / `#64748B`.
- Attention card: 12px radius, `#E5E7EB` border, 14/16 px padding.
- Attention card red tint (over-budget): bg `#FEF2F2`, left accent `#EF4444`.
- Attention card orange tint (delayed): bg `#FFFBF5`, left accent `#F97316`.
- Attention card amber tint (approval): bg `#FFFBEB`, left accent `#F59E0B`.
- Inline action buttons: follow existing `<Button>` primary/secondary variants.

---

## Build order

1. Strip: delete the "Navigate" card and the old KPI tile grid.
2. Build greeting + metrics row.
3. Build `<AttentionCard>` + `<AttentionList>`.
4. Wire the union query for attention items.
5. Hook up inline Approve / Dismiss.
6. Sort the existing project grid by risk_score.
7. Add sort dropdown + view toggle + subdivision filter chip.
8. Persist sort selection in localStorage.

---

## Acceptance criteria

- [ ] The "Navigate" card is gone.
- [ ] "Needs Attention" is the largest visible section above the fold.
- [ ] Attention cards show real items — over-budget, delayed, pending-approval — sorted by priority.
- [ ] Clicking "Approve" on a pending-invoice card approves it and the card disappears without a page navigation.
- [ ] "Dismiss" on an over-budget card hides it for 24h; it reappears after.
- [ ] The project grid on the dashboard is sorted by risk by default.
- [ ] Sort selection persists across reloads.
- [ ] Metrics row shows 4 inline metrics, not 4 cards.
- [ ] Greeting uses the current time of day.
- [ ] At-risk badge at top-right shows the correct count and clicking it scrolls to the section.
