# BuildForge UI Redesign — Design Specification

## Executive Summary

This document outlines a ground-up reimagining of the BuildForge construction ERP interface. The redesign is driven by three core principles: **mobile-first for field work**, **desktop-optimized for financial work**, and **construction-industry UX patterns** inspired by Procore and Buildertrend.

The biggest structural change: **kill the sidebar on mobile entirely** and replace it with a context-aware bottom tab bar + project-centric hub. On desktop, evolve the sidebar into a slimmer, icon-driven rail that expands on hover.

---

## Design Philosophy

**"Two apps in one shell."** The field experience (projects, stages, field logs, to-dos) and the office experience (AP, banking, reports, journal entries) have fundamentally different users and contexts — even though it's the same person. On a job site with muddy hands and bright sun, you need big targets, fast actions, and zero friction. At a desk doing bookkeeping, you need data density, keyboard shortcuts, and drill-down tables.

The redesign embraces this split rather than forcing one layout to serve both.

---

## 1. Navigation Architecture

### Mobile (< 1024px): Bottom Tab Bar + Contextual Headers

**Primary tabs (always visible, bottom of screen):**

| Tab | Icon | Destination |
|-----|------|-------------|
| Home | House icon | Dashboard — today's snapshot |
| Projects | HardHat icon | Project list — card grid |
| + (FAB) | Plus circle | Quick-add sheet (field log, to-do, invoice photo) |
| Money | DollarSign icon | Financial hub — AP, banking, reports |
| More | Menu icon | Settings, vendors, contacts, documents |

**Why this works:**
- 5 targets = comfortable one-handed reach on any phone
- The center FAB (floating action button) is the #1 action accelerator — one tap to log a note, snap an invoice photo, or create a to-do
- "Money" collapses the entire Financial section into a single hub entry point
- "More" handles low-frequency navigation without cluttering primary tabs

**Contextual navigation within sections:**
- Inside a project → horizontal scrollable pill tabs (Stages, Costs, Gantt, Logs, Docs)
- Inside Financial hub → segmented control (AP, Banking, Reports)
- Always: a sticky back arrow + page title in the header

### Desktop (≥ 1024px): Collapsed Icon Rail + Flyout Panels

**Replace the current 240px always-open sidebar with:**

1. **Icon rail (64px wide)** — always visible, shows icons + labels for top-level sections
2. **Flyout panel (280px)** — expands on hover/click to show sub-navigation
3. **Collapses automatically** when you click into content

**Rail sections (top to bottom):**
- Dashboard (single icon)
- Projects (icon → flyout shows project list with search + filters)
- Financial (icon → flyout shows AP, Banking, Reports sub-nav)
- Management (icon → flyout shows Vendors, Contacts, Documents)
- User avatar + settings at bottom

**Benefits:**
- Reclaims ~180px of horizontal space for content (huge for tables and financial data)
- Faster navigation — hover to preview, click to commit
- Cleaner visual hierarchy — content is the star, not the nav

---

## 2. Color System & Visual Language

### Updated Palette

**Primary brand:** `#4272EF` (keep — it's strong and recognizable)

**Semantic status colors (refined for outdoor visibility):**

| Status | Color | Hex | Usage |
|--------|-------|-----|-------|
| Complete | Emerald | `#10B981` | Stages done, invoices cleared, green badges |
| In Progress | Brand Blue | `#4272EF` | Active stages, current items |
| Warning | Amber | `#F59E0B` | Pending review, approaching deadlines |
| Overdue/Error | Red | `#EF4444` | Past due, expired COI, urgent |
| Delayed | Orange | `#F97316` | Delayed stages (distinct from warning) |
| Neutral | Slate | `#64748B` | Not started, void, inactive |

**Surface colors:**

| Surface | Light Mode | Usage |
|---------|-----------|-------|
| Background | `#F8FAFC` | Page background (slate-50) |
| Card | `#FFFFFF` | Content cards |
| Card hover | `#F1F5F9` | Hover state (slate-100) |
| Elevated card | white + `shadow-sm` | Cards that need visual lift |
| Sidebar rail | `#0F172A` | Dark rail (slate-900) |
| Sidebar flyout | `#1E293B` | Flyout panel (slate-800) |

### Typography

**Introduce Inter as the primary typeface** — it's designed for screens, has excellent number rendering (critical for financial data), and supports tabular figures.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Page title (desktop) | 24px | 700 (Bold) | 32px |
| Page title (mobile) | 20px | 700 | 28px |
| Section header | 16px | 600 (Semibold) | 24px |
| Body / table text | 14px | 400 (Regular) | 20px |
| Small / caption | 12px | 500 (Medium) | 16px |
| Tiny / label | 11px | 600 (Semibold) | 14px |
| Financial figures | 14–24px | 600 | — (tabular nums) |

**Key rule:** All financial numbers use `font-variant-numeric: tabular-nums` so columns align perfectly.

### Elevation & Depth

Move from flat borders to subtle shadows for card hierarchy:

| Level | CSS | Usage |
|-------|-----|-------|
| Level 0 | No shadow, `border border-slate-200` | Inline list items |
| Level 1 | `shadow-sm border border-slate-200/60` | Content cards |
| Level 2 | `shadow-md` | Modals, flyouts, popovers |
| Level 3 | `shadow-lg` | Bottom sheet on mobile |

### Border Radius

Standardize on a 12px radius system:

| Element | Radius |
|---------|--------|
| Cards | `rounded-xl` (12px) |
| Buttons | `rounded-lg` (8px) |
| Badges/pills | `rounded-full` |
| Input fields | `rounded-lg` (8px) |
| Bottom sheet | `rounded-t-2xl` (16px top only) |

---

## 3. Screen-by-Screen Redesign

### 3A. Dashboard (Mobile)

**Concept: "Today" view — what matters right now**

Layout (top to bottom, single column):

1. **Greeting bar**: "Morning, Jon" + notification bell + avatar
2. **Alert banner** (conditional): Red/amber strip if anything needs attention — tap to expand. "3 invoices to review · 1 past due · 2 vendor COIs expiring"
3. **Active project carousel**: Horizontal scroll of project cards showing name, current stage, progress ring, and budget health indicator. Tap → project detail. This is the primary navigation path on mobile.
4. **Quick actions row**: 4 large icon buttons in a row: "Field Log", "Snap Invoice", "To-Do", "View Draws"
5. **This week timeline**: Vertical timeline of upcoming stage starts/completions, invoice due dates, and to-do deadlines — grouped by day

**No sidebar. No hamburger menu.** Everything lives in the bottom tab bar or is one tap deep.

### 3B. Dashboard (Desktop)

**Concept: Command center with at-a-glance health**

Layout (3-column grid):

1. **Left (2/3 width):**
   - KPI strip: 4 cards (Active Projects, Open To-Dos, Alerts, AP Outstanding) — same as current but with refined styling and sparkline mini-charts
   - **Project health grid**: Cards for each active project showing a mini progress bar, budget gauge, current stage, and open to-do count. Grouped by subdivision. Click → project detail
   - **This Week** activity feed (same content as mobile but in a compact list)

2. **Right (1/3 width):**
   - **Needs Attention** panel with color-coded alert items
   - **Recent Activity** (field logs, invoice approvals, stage completions)
   - **Quick Actions** grid

### 3C. Project List (Mobile)

**Concept: Visual project browser with swipeable cards**

- **Segmented control at top**: "Homes" | "Land" (with count badges)
- **Search bar** below segmented control
- **Subdivision grouping** with collapsible headers
- **Project cards** (full-width, stacked):
  - Project name + address (large, bold)
  - Progress ring (% complete) on the right
  - Current stage name + status badge
  - Budget bar (spent vs budget, color-coded)
  - Lot/block info as subtle metadata
  - Swipe right → quick "Field Log" action
  - Swipe left → quick "View Costs" action

### 3D. Project Detail (Mobile)

**Concept: Scrollable hub with sticky tab bar**

- **Hero section** (fixed at top): Project name, address, status badge, progress ring
- **Sticky horizontal tab pills** below hero:
  - Stages | Costs | Gantt | Budget | Logs | Docs | Selections (home only)
  - Horizontally scrollable — active tab has brand blue underline + filled background
- **Tab content** fills remaining viewport with full scroll

**Stage tab (default):**
- Visual stage list with two-track layout (Exterior/Interior as section headers)
- Each stage: name, date range, status badge, tap to expand
- Expanded: notes, field logs for this stage, "Mark Complete" button, "Add Log" button
- Large touch targets (min 48px height per row)

### 3E. Gantt Chart (Both)

**Key improvement: Make it usable on mobile**

Mobile:
- Default to a simplified "stage timeline" view — vertical list with horizontal bars showing relative duration
- Pinch-to-zoom to enter full Gantt mode
- Sticky stage labels on the left (narrower — abbreviate to stage number + first word)
- Today line always visible
- Tap a bar → bottom sheet with stage details + actions

Desktop:
- Keep the current canvas-based approach but refine:
  - Add a minimap/overview bar at the top (shows full timeline, viewport indicator)
  - Sticky column for stage names (keep at 200px)
  - Baseline overlay toggle (dashed lines for original plan vs solid for current)
  - Hover tooltip with stage details
  - Right-click context menu: Mark Complete, Add Log, Edit Dates

### 3F. Accounts Payable (Desktop-Optimized)

**Concept: Power-user table with inline actions**

- **Filter bar** (sticky): Status multi-select, project dropdown, vendor dropdown, date range, search — all as compact filter pills
- **Bulk action bar** (appears when rows selected): Approve All, Issue Checks, Add to Draw
- **Table redesign:**
  - Denser rows (36px height vs current ~48px)
  - Sticky header row
  - Status shown as colored dot + text (not full badge — saves space)
  - Amount column right-aligned with tabular figures
  - Hover row → subtle highlight + inline action icons appear (approve, issue check, void)
  - Row expansion on click → shows line items, AI notes, attached PDF thumbnail
- **Summary strip above table**: Total pending, total approved, total past due — as inline metrics

Mobile AP:
- Card-based list instead of table
- Each card: vendor name, amount (large), project, status badge, due date
- Tap → full invoice detail
- Swipe actions: approve (right), dispute (left)

### 3G. Banking / Draw Requests

Desktop:
- **Tab layout**: Bank Accounts | Loans | Draws | Payment Register
- Draw assembly page: drag invoices from "eligible" pool into draw, see running total, submit with one click
- Loan detail: clean summary card with balance, rate, maturity + draw history timeline below

Mobile:
- Draw status view: card per draw with status badge, total, date
- Tap → draw detail with invoice list
- "Quick: Add to Draw" available from invoice approval flow

### 3H. Financial Reports (Desktop Only)

- **No mobile optimization needed** — these are desk/office tools
- **Shared report chrome**: Title, date range selector, export buttons (PDF, Excel), print
- **Tables**: Full-width, zebra-striped, sticky headers, right-aligned numbers
- **Drill-down**: Click any line item amount → slide-out panel showing underlying journal entries
- **Charts**: Add a small trend chart above each report (sparkline for income statement, stacked bar for balance sheet composition)

---

## 4. Component Library Upgrades

### Card Component

```
┌─────────────────────────────────────────┐
│  [Icon]  Title                 [Badge]  │
│  Subtitle / metadata                    │
│                                         │
│  Content area                           │
│                                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  Footer actions                [Arrow]  │
└─────────────────────────────────────────┘
```

Variants: Default, Elevated, Interactive (hover lift), Alert (colored left border), Compact

### Status Badge

Pill-shaped, small, consistent across the app:

| Status | Style |
|--------|-------|
| Active / In Progress | Blue bg, white text |
| Complete / Cleared | Green bg, white text |
| Pending | Amber bg, dark text |
| Overdue / Expired | Red bg, white text |
| Delayed | Orange bg, white text |
| Void / Inactive | Gray bg, gray text |

### Progress Indicators

1. **Progress Ring** (for project cards): SVG circle, 40px on mobile / 48px on desktop
2. **Budget Bar**: Horizontal bar with spent (blue) vs budget (gray) — turns red when over
3. **Stage Progress Dots**: Row of small dots, filled = complete, outlined = remaining

### Bottom Sheet (Mobile)

Used for: quick actions, stage details, invoice detail, filter panels

- Slides up from bottom with `rounded-t-2xl`
- Drag handle at top (pill-shaped, 40px wide)
- Can snap to half-screen or full-screen
- Backdrop dimming

### FAB (Floating Action Button)

Center of bottom tab bar, slightly elevated:
- 56px circle, brand blue
- Plus icon, white
- Tap → expands to action sheet: "Field Log", "Snap Invoice", "New To-Do", "Quick Note"

---

## 5. Animation & Transitions

Keep it subtle and purposeful — no decoration, only communication.

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Page transition | Content fade-in + slide-up (8px) | 200ms |
| Bottom sheet open | Slide up + backdrop fade | 300ms (spring) |
| Card hover (desktop) | Translate Y -2px + shadow increase | 150ms |
| Tab switch | Content crossfade | 150ms |
| Status change | Color transition | 200ms |
| Sidebar flyout | Slide right + fade | 200ms |
| FAB expand | Scale up from center | 250ms (spring) |
| Alert banner | Slide down from top | 300ms |

---

## 6. Responsive Breakpoints

| Breakpoint | Name | Layout |
|------------|------|--------|
| < 640px | Mobile | Single column, bottom tabs, cards only |
| 640–1023px | Tablet | 2-column grids, bottom tabs, some tables |
| ≥ 1024px | Desktop | Icon rail + content, full tables, flyout nav |
| ≥ 1440px | Wide | 3-column dashboard, wider tables |

---

## 7. Accessibility & Field Conditions

**Outdoor/sunlight considerations:**
- Minimum contrast ratio: 4.5:1 (WCAG AA) for all text
- Status colors use both color AND icon/text — never color alone
- Progress indicators have numeric labels alongside visual bars

**Gloved/dirty hands:**
- Minimum touch target: 48×48px on mobile
- Swipe gestures as alternatives to small tap targets
- FAB is 56px — easy to hit

**Connectivity:**
- Design all mobile views to work with stale/cached data
- Show "last synced" timestamp when offline
- Queue actions (field logs, to-dos) for sync when reconnected

---

## 8. Migration Strategy

This redesign can be implemented incrementally:

**Phase 1 — Navigation & Layout (highest impact)**
- Build bottom tab bar component for mobile
- Convert sidebar to icon rail + flyout for desktop
- Create new Header component with contextual titles
- Update main layout to support both modes

**Phase 2 — Dashboard & Project Hub**
- Rebuild dashboard for mobile (Today view) and desktop (Command center)
- New project cards with progress rings and budget bars
- Project detail page with sticky tab pills

**Phase 3 — Mobile Field Experience**
- FAB + quick action sheet
- Stage management with large touch targets
- Field log creation flow (minimal typing, quick capture)
- Swipe actions on cards

**Phase 4 — Financial Desktop Experience**
- AP table redesign with inline actions and bulk operations
- Draw assembly drag-and-drop
- Financial report chrome + drill-down panels
- Tabular figures and number formatting

**Phase 5 — Polish & Animation**
- Page transitions
- Bottom sheet interactions
- Hover states and micro-interactions
- Loading skeletons
