# BuildForge — Mobile nav: tap-to-sheet sub-nav

**Handoff to Claude Code · April 2026**

## Overview

On mobile, the bottom tab bar gives fast single-tap navigation but has no way to reveal sub-nav (a hover flyout isn't an option on touch). This handoff implements **tap-active-tab-again → bottom sheet** with the same sub-nav + pinned items the desktop flyout shows. The center "+" FAB is never touched — it stays as the quick-add.

Tied to `§ 01b` of `UI Review.html`.

---

## About the Design Files

`UI Review.html § 01b` is the **design reference**. Recreate in BuildForge's existing Next.js + Tailwind mobile layout (`src/components/layout/AppShell.tsx` or wherever the bottom tab bar lives).

---

## Fidelity

**Medium.** Layout and interaction model are canonical. Animation timing is a guideline; match iOS-style sheet physics (Framer Motion or the existing animation library in the project).

---

## Goals & non-goals

### Goals

1. Re-use the same sub-nav content map as the desktop flyout (handoff `design_handoff_desktop_nav_flyout`).
2. Tap a **non-active** tab → navigate to that section's default page (unchanged).
3. Tap the **already-active** tab → slide a bottom sheet up from the tab bar revealing sub-nav + pinned items.
4. Long-press any tab → same bottom sheet opens (power-user shortcut).
5. Don't hijack the center "+" FAB. It remains universal quick-add.
6. Mobile top bar becomes useful: page title + context, not just "BuildForge".

### Non-goals

- Changing the IA — it matches desktop exactly.
- Tablet layout — tablet uses the desktop rail + flyout (handoff `design_handoff_desktop_nav_flyout`).

---

## Screens / Views

### 1. Bottom tab bar (unchanged visually)

- 5 tabs: Home · Projects · `+` · Financial · More
- Tab bar height 58px, white, top border `#E5E7EB`.
- Active tab: brand color icon + label, 2px top accent bar.
- Center "+" FAB: 42×42 circle, brand color, elevated (shadow), overflows tab bar top by ~14px.

### 2. Sub-nav bottom sheet

- Slides up over content. Height ~60% of viewport max; height-to-content otherwise.
- Top: drag handle (36×4 pill, `#CBD5E1`).
- Section label (eyebrow): `JetBrains Mono`, 9px, letter-spacing .12em, uppercase, color `#94A3B8`.
- Sub-nav items: 36px rows, 13px label, 9/10px padding.
  - Active item: background `rgba(66,114,239,.1)`, text `#2E5BD8`, font-weight 500.
  - Other items: color `#334155`.
- Divider, "Pinned" eyebrow, up to 3 pinned projects (not 5 — mobile real estate).
- Content behind sheet dims to `rgba(15,23,42,.35)`.
- Tab bar stays visible at the bottom of the sheet (users can tap another tab to switch section).

### 3. Top bar — repurposed

Instead of "BuildForge" + hamburger, show:

- Page title (e.g. "Accounts payable", "Projects", "Lot 12 — Prairie Heights").
- On index pages: any active filter chips next to the title so context is visible without scrolling.
- Right side: search icon → overflow menu (`⋯`) → avatar.

Greeting bar ("Morning, Jon") sits just under the top bar on the dashboard route only — not global.

---

## Interactions & Behavior

| Gesture | Action |
|---|---|
| Tap a non-active tab | Navigate to that section's default page. Sheet stays closed. |
| Tap the already-active tab | Open bottom sheet for that section. |
| Long-press any tab | Open bottom sheet for that tab's section (works regardless of active state). |
| Tap `+` | Open quick-add (existing behavior — do not change). |
| Swipe down on sheet | Close sheet. |
| Tap dimmed content behind sheet | Close sheet. |
| Tap a sub-nav item | Navigate to that route + close sheet. |
| Tap "More" tab | Open the full nav tree sheet (Vendors / Contacts / Documents / Settings / Sign out). |

### Animation

- Sheet slide-in: 240ms ease-out. Dim fade-in synced.
- Sheet dismiss: 180ms ease-in.
- Match iOS sheet spring if Framer Motion is available.

---

## State Management

- Sheet open/closed: local component state.
- Active tab: derived from current route.
- Pinned projects: shared query with desktop flyout — same 5-item fetch.
- No persistent pin state on mobile; sheet always opens fresh on gesture.

---

## Design Tokens

- Sheet bg: white
- Sheet radius: 16px top corners
- Sheet shadow: `0 -4px 20px rgba(0,0,0,.12)`
- Dim overlay: `rgba(15,23,42,.35)`
- Drag handle: `#CBD5E1`, 36×4, 2px radius
- Active sub-nav: `rgba(66,114,239,.1)` bg, `#2E5BD8` text
- Tab bar height: 58px
- FAB size: 42px
- Animation: `240ms ease-out` in, `180ms ease-in` out

---

## Build order

1. Top bar redesign: page title + context chips + overflow menu.
2. Greeting bar on dashboard route only.
3. `<NavSheet>` component — takes a `section` prop, renders same content map as desktop flyout.
4. Hook up tap-active-tab-again detection (compare pathname on each tap).
5. Long-press handler on all tabs.
6. Swipe-to-dismiss + tap-dim-to-dismiss.
7. "More" tab opens full nav tree sheet (Vendors, Contacts, Documents, Settings, Sign out).

---

## Acceptance criteria

- [ ] Tapping "Projects" when on Home navigates to `/projects` with no sheet.
- [ ] Tapping "Projects" while already on a `/projects/*` route opens the sheet.
- [ ] Long-pressing "Financial" from any route opens the Financial sheet.
- [ ] Center "+" FAB behavior is unchanged — it does not open the sheet under any gesture.
- [ ] Sheet content matches the desktop flyout for the same section (IA parity).
- [ ] Mobile top bar shows the current page title, not "BuildForge".
- [ ] Dashboard route shows "Morning, &lt;name&gt;" under the top bar.
- [ ] Swipe down or tap-outside dismisses the sheet.
- [ ] "More" tab opens a sheet with Vendors, Contacts, Documents, Settings, Sign out.
