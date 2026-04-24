# BuildForge — AP invoices table

**Handoff to Claude Code · April 2026**

## Overview

The current AP invoices table is the most-used screen in the app but has three structural issues: a cluttered filter header, pastel status pills that read all-alike, and a hover-only Approve action that makes batch approvals tedious. This handoff redesigns the table to make approvals a one-click, always-visible action and tightens the visual density.

Tied to `§ 03` of `UI Review.html`.

---

## About the Design Files

`UI Review.html § 03` is the **design reference** showing the redesigned table. Recreate in BuildForge's existing Next.js + Tailwind app — look at `src/app/financial/ap/page.tsx` (or wherever the AP table lives) and its `<InvoicesTable>` component.

---

## Fidelity

**High.** This is the highest-traffic table in the app; get column widths, row height, and status color mapping exactly as specified.

---

## Goals & non-goals

### Goals

1. **Always-visible Approve button** on each pending-approval row. No hover required.
2. Replace pastel status pills with **dot + label** — legible at a glance.
3. Consolidate the filter row: search stays prominent, status/date/project filters collapse into a single "Filters" popover with active-filter chips below.
4. Put **cost code name first**, number as muted metadata. ("Framing Labor · 06-200" not "06-200 — Framing Labor").
5. Support **batch approve** via checkbox selection + sticky batch action bar.
6. Responsive: stack to cards on mobile, not a squished table.

### Non-goals

- Changing the invoice detail page.
- Changing how invoices are ingested.
- New approval workflows (multi-step etc.) — just make the existing single-approve flow faster.

---

## Screens / Views

### 1. Desktop table — default state

```
┌─────────────────────────────────────────────────────────────────┐
│ Accounts payable                                 + New invoice  │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 Search invoices, vendors, cost codes...    [Filters: 2] ⌄   │
│ Chips: [Pending approval ×] [Prairie Heights ×]                 │
├──┬────────┬──────────────┬──────────────────┬──────┬──────┬─────┤
│☐ │INV #   │VENDOR        │COST CODE         │AMOUNT│STATUS│ACTION│
├──┼────────┼──────────────┼──────────────────┼──────┼──────┼─────┤
│☐ │#1847   │Rocky Mtn     │Framing Labor     │$12.4k│●Pend │Approve│
│  │        │Lumber        │06-200            │      │ apprvl│ Open  │
├──┼────────┼──────────────┼──────────────────┼──────┼──────┼─────┤
│☐ │#1846   │Diamond       │Concrete Pumping  │ $3.2k│●Appr │ Open  │
│  │        │Concrete      │03-310            │      │      │       │
└──┴────────┴──────────────┴──────────────────┴──────┴──────┴─────┘
```

### Column widths (canonical)

| Column | Width | Notes |
|---|---|---|
| Checkbox | 40px | Sticky left |
| INV # | 96px | `tabular-nums` |
| Vendor | flex(1.2) | Single line, ellipsis |
| Cost code | flex(1.5) | Name first, number muted second line |
| Amount | 100px | Right-aligned, `tabular-nums`, `$12.4k` format |
| Status | 140px | Dot + label |
| Action | 160px | Always visible |

Row height: **52px**. No alternating backgrounds — bottom border only (`#F1F5F9`).

### 2. Filters popover

Triggered by the "Filters" button. Inline popover with:

- Status (multi-select checkboxes): Draft · Pending approval · Approved · Paid · Void
- Project (multi-select): all projects in the org
- Date range: presets (This week, This month, Last 30 days, Custom)
- Amount range: min / max inputs
- "Clear all" link at the bottom
- "Apply" button (primary)

Active filters show as **chips** directly below the search bar, dismissible with `×`. Chips reflect exactly one filter each — 2 projects selected → 2 chips.

### 3. Status cell — dot + label

Replace the current pastel pills with:

- Small colored dot (8px circle) + label text (12px, color `#334155`).
- Color mapping (match status dot taxonomy):

| Status | Dot color | Label |
|---|---|---|
| Draft | `#64748B` | Draft |
| Pending approval | `#F59E0B` | Pending approval |
| Approved | `#4272EF` | Approved |
| Paid | `#10B981` | Paid |
| Void | `#94A3B8` | Void |
| Overdue | `#EF4444` | Overdue |

### 4. Action cell — always visible

Two inline text links with a separator:

- `Approve · Open` for pending-approval invoices.
- `Mark paid · Open` for approved invoices.
- `Open` only, for all other statuses.

Approve / Mark paid are primary-tinted (`#2E5BD8`). Open is muted (`#64748B`).

**Do not hide these behind hover.** A field superintendent on a trackpad laptop should see approvable invoices without hovering row-by-row.

### 5. Batch action bar

When ≥1 row is selected:

- A sticky bar appears at the bottom of the viewport (or just under the table header on mobile).
- Content: "{n} selected" + actions (Approve all · Reject all · Mark paid · Export CSV · Clear selection).
- Approve all: batch-approves only the rows with `status = 'pending_approval'`; ignores others silently.
- Shift-click on checkboxes selects a range.
- Select-all checkbox in header selects the **filtered** set, not the whole table.

### 6. Mobile — card view

Below 768px, the table becomes a stack of cards:

```
┌─────────────────────────────────────────┐
│ #1847  ·  Rocky Mtn Lumber              │
│ Framing Labor · 06-200                  │
│ $12.4k               ●Pending approval  │
│ [Approve]  [Open]                       │
└─────────────────────────────────────────┘
```

- 12px radius, 1px border.
- 14px padding.
- Tap card body → navigate to invoice detail.
- Buttons are full-size tap targets (44px height).

---

## Interactions & Behavior

### Approve (single row)

- Posts to `/api/invoices/[id]/approve`.
- Optimistic update: row's status changes to "Approved" immediately, Approve button swaps to "Mark paid".
- On failure: revert + toast.

### Approve all (batch)

- Posts to `/api/invoices/batch-approve` with the array of selected IDs.
- Optimistic: all rows update in sequence.
- On partial failure, individual rows revert; toast lists the failed ones with "Retry".

### Search

- Debounced 200ms.
- Matches invoice number, vendor name, cost code (name or number), amount.
- Updates URL search param so the page is shareable.

### Filters

- Multi-select, ANDed together.
- Filter state lives in URL search params (`?status=pending&project=prairie-heights,northfield`).
- Chips appear below search bar for every active filter.

### Sorting

- Click column header to sort. Default: invoice number desc.
- Sortable columns: INV #, Vendor, Amount, Status.
- Persist sort in URL (`?sort=amount-desc`).

### Keyboard

- `j / k` — next / previous row.
- `x` — toggle select on focused row.
- `a` — approve focused row (if pending).
- `o` — open focused row's detail.
- `/` — focus search.

---

## State Management

- Filter / sort / selection state all in URL search params. Shareable, bookmark-able, survives refresh.
- Selection is held in component state but is cleared when filters change (selection may no longer be visible).
- Optimistic updates use a local cache layer; reconcile with server response.

---

## Data

### Initial fetch (server component)

```sql
select i.*, v.name as vendor_name, cc.name as cost_code_name, cc.number as cost_code_number
from invoices i
join vendors v on v.id = i.vendor_id
join cost_codes cc on cc.id = i.cost_code_id
where i.org_id = :orgId
  {filters}
order by {sort}
limit 100;
```

Paginate at 100 per page. Infinite scroll or "Load more" button — pick based on existing project convention.

---

## Design Tokens

- Row height: 52px
- Column divider: none (bottom border `#F1F5F9` only)
- Sticky header background: `#F8FAFC`
- Selected row background: `rgba(66,114,239,.06)`
- Hover row background: `#F8FAFC`
- Status dot: 8px circle
- Checkbox: 16px, `#CBD5E1` border, brand fill when checked
- Batch action bar: sticky bottom, white bg, shadow `0 -2px 12px rgba(0,0,0,.08)`, 60px height

---

## Build order

1. Rewrite status cell: dot + label component. Replace everywhere status is displayed app-wide.
2. Column layout + widths as specified. Cost code name-first.
3. Always-visible action cell.
4. Filter popover + active-filter chips.
5. Batch selection + sticky action bar + shift-click range.
6. Optimistic single-approve.
7. Optimistic batch-approve endpoint + wiring.
8. Keyboard shortcuts.
9. Mobile card view below 768px.

---

## Acceptance criteria

- [ ] Every pending-approval invoice row shows an Approve button without hovering.
- [ ] Clicking Approve approves the invoice without reloading the page.
- [ ] Status pills are replaced by dot + label. Matches the color map above.
- [ ] Cost code column shows "Framing Labor" first with "06-200" as muted metadata.
- [ ] Filters popover contains Status / Project / Date / Amount, and active filters show as dismissible chips below the search.
- [ ] Selecting 3 pending invoices and clicking "Approve all" approves all three optimistically.
- [ ] Shift-clicking two checkboxes selects the range between them.
- [ ] Below 768px, rows render as cards with full-width Approve / Open buttons.
- [ ] `/financial/ap?status=pending&project=prairie-heights` loads with those filters applied and chips shown.
- [ ] Keyboard shortcut `a` approves the focused pending-approval row.
