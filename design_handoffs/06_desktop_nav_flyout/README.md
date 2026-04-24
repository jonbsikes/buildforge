# BuildForge — Desktop nav flyout

**Handoff to Claude Code · April 2026**

## Overview

The design spec promised an icon rail + **280px flyout** on desktop. The shipped UI ships the 64px rail only — the flyout never appears. This means navigating to any sub-section requires a page load, and users get no preview of what lives inside a section. This handoff implements the flyout.

Tied to `§ 01` of `UI Review.html`.

---

## About the Design Files

The HTML in `UI Review.html § 01` is a **design reference** showing the intended flyout shape, content, and styling. Recreate it inside BuildForge's existing Next.js + Tailwind app. The existing `src/components/layout/DesktopNavRail.tsx` is the file to extend.

---

## Fidelity

**Medium-high.** Exact widths, colors, and interaction model are canonical. Type sizes and spacing follow the BuildForge design spec (`DESIGN-SPEC.md`).

---

## Goals & non-goals

### Goals

1. Add a 280px dark flyout panel that appears to the right of the rail on hover or focus.
2. Populate the flyout with the active section's sub-nav items + a "Pinned" region below.
3. Click on a rail item → pin the flyout open (so user can navigate while panel stays visible).
4. Outside click or Escape → unpin the flyout.
5. Move sign-out out of the rail; put it in the avatar menu at top-right.

### Non-goals

- Changing the rail's 64px width or icon set.
- Mobile nav (see separate handoff `design_handoff_mobile_nav_sheet`).

---

## Screens / Views

### 1. Rail — closed state (default)

- 64px wide, full viewport height, background `#0F172A`.
- Logo at top (40×40, 10px radius).
- Each nav item is 48×48, with a 20px icon and an 11px label beneath it.
- Active item: subtle brand tint background, left accent bar.
- No sign-out item on the rail anymore.

### 2. Rail + flyout — open state

- Flyout is 220–280px wide (use 240px), height = full viewport, positioned directly right of the rail with no gap.
- Background `#1E293B` (one step lighter than the rail, so there's a visible seam).
- Top: section name in `JetBrains Mono`, 10px, letter-spacing .12em, uppercase, color `#64748B`.
- Below: sub-nav items stacked, each 36px tall, 13px label, 7/10px padding.
  - Hover: background `rgba(255,255,255,.04)`.
  - Active: background `rgba(66,114,239,.22)`, text `#BFD1FD`.
- A thin divider (`#334155`), then a "Pinned" region with the same eyebrow style and up to 5 recently-touched projects listed below.

### Section content map

| Rail item | Sub-nav items (in order) |
|---|---|
| Home | Overview · Today · Recent activity |
| Projects | All projects · Gantt · Reports · Field logs · To-dos |
| Financial | Accounts payable · Draws · Budgets · Cost codes · Reports |
| Manage | Vendors · Contacts · Documents · Settings |

Each sub-nav item is a route: `/projects/gantt`, `/financial/ap`, etc. Follow existing URL conventions.

### 3. Avatar menu (top-right, new)

- Circle avatar, user's initials, size 32.
- Click opens a dropdown menu: name + role header, then "My profile", "Notifications", divider, "Sign out".
- This absorbs the sign-out button that used to live on the rail.

---

## Interactions & Behavior

- **Hover on a rail item** → flyout opens showing that section's sub-nav. Hover off with no click → flyout closes after 200ms.
- **Click on a rail item** → navigate to that section's default page AND pin the flyout open. Pinned state uses `localStorage["nav.pinned"] = true`.
- **Click outside flyout** → unpin (if pinned) or close.
- **Escape** → unpin + close.
- **Keyboard:** Tab moves through rail items, arrow keys move within the open flyout, Enter navigates.
- **Animation:** flyout slides in from left over 120ms with ease-out. Opacity 0 → 1 in sync.

---

## Pinned projects data

Pull the last 5 touched projects for the current user:

```sql
select id, name, subdivision_name, status
from projects
where org_id = :orgId
order by updated_at desc
limit 5;
```

Each is a clickable row — clicking navigates to that project's detail page. No icons; just the name. Subtle second line with subdivision name in `#64748B`.

---

## State Management

- Flyout open/closed/pinned in a React context or zustand slice — not URL-driven.
- Pinned state persists in localStorage.
- Recently-touched projects fetched once per session (cache in memory), revalidate on navigation.

---

## Design Tokens

- Rail bg: `#0F172A`
- Flyout bg: `#1E293B`
- Flyout divider: `#334155`
- Flyout active item: `rgba(66,114,239,.22)` bg, `#BFD1FD` text
- Flyout hover: `rgba(255,255,255,.04)` bg
- Muted eyebrow: `#64748B`
- Body text in flyout: `#CBD5E1`
- Flyout width: `240px`
- Animation: `120ms ease-out`

---

## Build order

1. Avatar menu at top-right with sign-out moved in.
2. Remove sign-out from `DesktopNavRail.tsx`.
3. Build `<NavFlyout>` component with section-keyed content map.
4. Wire hover + click + pinned state.
5. Add "Pinned projects" query + render.
6. Keyboard navigation.
7. Animations.

---

## Acceptance criteria

- [ ] Hovering "Projects" shows a flyout with All projects / Gantt / Reports / Field logs / To-dos.
- [ ] Clicking "Projects" navigates to `/projects` and keeps the flyout pinned open.
- [ ] Clicking outside the flyout while pinned un-pins it.
- [ ] Escape un-pins and closes.
- [ ] The 5 most-recently-touched projects appear under "Pinned".
- [ ] Sign-out is no longer on the rail; it's in the avatar menu.
- [ ] Rail width is unchanged (64px).
- [ ] `localStorage["nav.pinned"]` persists across reloads.
