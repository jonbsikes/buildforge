# BuildForge — Design system tightening

**Handoff to Claude Code · April 2026**

## Overview

The current UI uses ~5 different badge treatments interchangeably (pastel pills, outlined chips, solid pills, text-only muted labels, dot-only), ~3 overlapping orange/amber/yellow colors with no semantic discipline, and inconsistent card radii / shadow / border treatment across screens. This handoff codifies a minimal system — two badge types, one status color map, one card style — and does a repo-wide replacement.

Tied to `§ 05` of `UI Review.html`.

---

## About the Design Files

`UI Review.html § 05` is the **design reference**. Codify it as tokens in `src/app/globals.css` + a small set of React primitives in `src/components/ui/`, then do a repo-wide migration away from ad-hoc replacements.

---

## Fidelity

**High for tokens** (use the exact hex values). **Medium for migration scope** — migrate high-traffic surfaces first (dashboard, AP, projects index, project detail, project card), stop if a lower-traffic surface is clearly bespoke for a reason.

---

## Goals & non-goals

### Goals

1. **Two badge types only:**
   - **StatusBadge** — colored dot + label. For state (Pending, Approved, Over-budget, etc.).
   - **MetadataChip** — outlined chip. For facts (plan name, lot #, phase name, permit #, etc.).
2. **One canonical status color map.** Orange means delay. Amber means warning/approval. Never cross them.
3. **One card style.** 12px radius, 1px `#E5E7EB` border, no shadow by default (shadow only on hover/elevation contexts).
4. Repo-wide sweep: replace every ad-hoc pill / chip / badge with one of the two primitives.

### Non-goals

- Re-theming (light/dark mode or brand-color variants).
- Icon system changes.
- Typography scale changes.

---

## Canonical tokens

Add or reconcile these in `src/app/globals.css`. Values are canonical — use them exactly.

### Status color map

```css
:root {
  /* Status — reserved meanings, don't overload */
  --status-complete:  #10B981;   /* green — finished, paid, sold, closed */
  --status-active:    #4272EF;   /* blue — in progress, healthy */
  --status-delayed:   #F97316;   /* orange — schedule slip, past due */
  --status-warning:   #F59E0B;   /* amber — pending approval, expiring soon, review needed */
  --status-over:      #EF4444;   /* red — over budget, error, critical */
  --status-planned:   #CBD5E1;   /* grey — not started, void, cancelled */
  --status-neutral:   #64748B;   /* slate — muted labels, metadata */

  /* Row / card tints (10% versions) */
  --tint-over:     #FEF2F2;
  --tint-delayed:  #FFFBF5;
  --tint-warning:  #FFFBEB;
  --tint-active:   #F0F4FF;
  --tint-complete: #ECFDF5;

  /* Card */
  --card-bg:      #FFFFFF;
  --card-border:  #E5E7EB;
  --card-radius:  12px;
  --card-padding: 14px;

  /* Borders / dividers */
  --border-strong: #CBD5E1;
  --border-weak:   #E5E7EB;
  --border-hair:   #F1F5F9;
}
```

### Semantic status → color

| Status | Token |
|---|---|
| Complete, Paid, Sold, Closed | `--status-complete` |
| Active, In progress, Healthy | `--status-active` |
| Delayed, Past due, Overdue (schedule) | `--status-delayed` |
| Pending approval, Expiring COI, Needs review | `--status-warning` |
| Over budget, Error, Critical, Overdue (financial) | `--status-over` |
| Planned, Not started, Void, Cancelled | `--status-planned` |
| Draft, Archived | `--status-neutral` |

**Orange vs amber is the thing nobody gets right.** Orange = *it's late*. Amber = *somebody needs to do a thing*. Pending approval is amber, a stage that blew its deadline is orange.

---

## Primitives

### `<StatusBadge>`

File: `src/components/ui/StatusBadge.tsx`.

```tsx
type StatusBadgeProps = {
  status: "complete" | "active" | "delayed" | "warning" | "over" | "planned" | "neutral";
  children: React.ReactNode;           // label text
  size?: "sm" | "md";                   // sm = 11px, md = 12px
};
```

Visual: 8px colored dot + label. No border, no background tint. Inline-flex, 6px gap.

Example use: `<StatusBadge status="warning">Pending approval</StatusBadge>`

### `<MetadataChip>`

File: `src/components/ui/MetadataChip.tsx`.

```tsx
type MetadataChipProps = {
  icon?: React.ReactNode;               // optional lucide icon, 12×12
  children: React.ReactNode;
  variant?: "default" | "accent";       // accent uses brand-blue outline
};
```

Visual: 1px `#CBD5E1` outline, 4px radius, 11px text `#334155`, 4px vertical / 8px horizontal padding.

Example use: `<MetadataChip icon={<MapPin/>}>Prairie Heights</MetadataChip>`

### `<StatusDot>` (already exists — audit & fix)

If the project already has a `StatusDot`, update it to consume the canonical tokens. If multiple competing implementations exist, keep one.

### `<Card>` primitive

File: `src/components/ui/Card.tsx` — thin wrapper enforcing the canonical card style. Not required but recommended to stop drift.

```tsx
<Card accent="over">
  {children}
</Card>
```

Renders: `bg-white border border-[var(--card-border)] rounded-[var(--card-radius)] p-[var(--card-padding)]` plus a 3px left accent when `accent` is set.

---

## Migration strategy

The codebase has historical badge/chip/pill shapes scattered. Do a systematic sweep:

1. **Grep for pills.** Search `grep -r "rounded-full"` and review each hit — most will be status/metadata displays that should become `<StatusBadge>` or `<MetadataChip>`.
2. **Grep for bg-color + rounded.** Pastel-tinted chips are almost always status displays.
3. **Grep for inline `border-2` or `border-4`.** These are usually ad-hoc emphasis — delete, replace with accent border pattern.
4. **Grep for `shadow-md` / `shadow-lg`.** Most cards don't need a shadow in the new system. Keep shadow only for elevation contexts (modals, dropdowns, sticky headers, hover states).
5. **Audit all color literals** (`grep -r "#F97316\|#F59E0B\|#EF4444\|#FB923C"`). Replace with tokens. If you find a color that doesn't map to a status, either add a new token or (more likely) the usage is wrong.

### Priority order for migration

1. `ProjectCard.tsx` (also being redesigned in `design_handoff_project_card`)
2. `InvoicesTable.tsx` / AP (also being redesigned in `design_handoff_ap_invoices_table`)
3. Project detail page
4. Subdivision / projects list pages (also being redesigned in `design_handoff_projects_drilldown`)
5. Dashboard (also being redesigned in `design_handoff_dashboard_rework`)
6. Vendor pages, documents, field logs, etc.

If you're doing the design-system tightening alongside the larger redesigns, sequence it so tokens + primitives land first, then each redesign consumes them.

---

## Before/after examples

### Before — AP status pill
```tsx
<span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800">
  Pending approval
</span>
```

### After
```tsx
<StatusBadge status="warning">Pending approval</StatusBadge>
```

### Before — lot number chip
```tsx
<span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-700">
  Lot 08
</span>
```

### After
```tsx
<MetadataChip>Lot 08</MetadataChip>
```

### Before — project detail delayed banner
```tsx
<div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
  <p className="text-yellow-800">Framing delayed 3 days</p>
</div>
```

### After
```tsx
<Card accent="delayed" className="p-4">
  <StatusBadge status="delayed">Framing delayed</StatusBadge>
  <span className="text-sm text-slate-600 ml-2">3 days past schedule</span>
</Card>
```

(Orange, because it's schedule delay — not amber.)

---

## Acceptance criteria

- [ ] `globals.css` has the canonical tokens above.
- [ ] `StatusBadge`, `MetadataChip`, and `Card` primitives exist and are documented (JSDoc or storybook entry).
- [ ] Every pastel pill on the dashboard, AP table, project card, and projects list is replaced by one of the two primitives.
- [ ] No literal `#F97316` / `#F59E0B` / `#EF4444` color codes remain in component files — all go through tokens.
- [ ] "Pending approval" uses amber (`--status-warning`). "Framing delayed 3 days" uses orange (`--status-delayed`). They are different colors.
- [ ] Default cards are 12px radius, 1px border, no shadow. Shadows only on modals, dropdowns, sticky bars, hover states.
- [ ] A new contributor can find the two badge primitives by searching `StatusBadge` or `MetadataChip` — no sprinkled ad-hoc inline pills remain.

---

## What not to do

- Don't introduce a third badge type "for that one case." If you think you need one, it almost certainly belongs as a variant on the two that exist, or it's not a badge.
- Don't add gradients or glass effects.
- Don't put an icon inside a StatusBadge — the dot is the icon. MetadataChip optionally takes an icon.
- Don't extend the status color map with new colors. Seven states is enough. If a new state emerges (e.g. "On hold"), first ask whether it maps to an existing state semantically.
