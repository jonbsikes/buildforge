# BuildForge UI Redesign — Progress & Remaining Work

## Goal

Ground-up reimagining of the entire BuildForge UI. Projects and dashboards are mobile-first (iPhone on job sites), financial components are desktop-optimized (office accounting). Inspired by Procore/Buildertrend. Brand color: `#4272EF`.

---

## Completed

### Phase 1 — Design & Prototype

- **DESIGN-SPEC.md** — Full design specification covering navigation architecture, color system, typography, screen-by-screen redesign, component library, animations, responsive breakpoints, and 5-phase migration strategy.
- **ui-redesign-prototype.jsx** — 1,170+ line interactive React prototype with sample data. Renders inside the app as a `.jsx` artifact. Includes phone frame, mobile dashboard, mobile project detail, mobile AP view, desktop dashboard, desktop AP table, and all new components.

### Phase 2 — Navigation Shell & Dashboard Rebuild

**New components created:**

| File | Description |
|---|---|
| `src/components/layout/BottomTabBar.tsx` | Mobile bottom tab bar — 5 tabs (Home, Projects, FAB (+), Money, More). Route-aware active states. Hidden on desktop (`lg:hidden`). |
| `src/components/layout/QuickActionSheet.tsx` | Slide-up bottom sheet from FAB tap — Field Log, Snap Invoice, New To-Do, New Invoice. Backdrop blur, `animate-slide-up`. |
| `src/components/layout/DesktopNavRail.tsx` | 64px icon rail with flyout panels (264px). Prairie Sky logo at top. 4 nav sections: Home, Projects, Financial, Manage. Hover with 200ms timeout. Hidden on mobile (`hidden lg:flex`). |
| `src/components/ui/ProgressRing.tsx` | SVG circular progress ring. Color-coded: ≥70% green, ≥40% blue, <40% amber. Props: `progress`, `size`, `strokeWidth`. |
| `src/components/ui/BudgetBar.tsx` | Horizontal budget bar (spent vs budget). Color: over=red, >85%=amber, normal=blue. Has compact mode. Uses `tabular-nums`. |
| `src/components/ui/StatusBadge.tsx` | Pill-shaped status badges for all 13 status types across the app (complete, in_progress, not_started, delayed, pending_review, approved, released, cleared, active, pre_construction, on_hold, disputed, void). |
| `src/components/ui/StageStrip.tsx` | Two-track (EXT/INT) stage strip showing recent complete, current in-progress, and upcoming stages. Checkmark/dot/arrow icons. Delayed count with warning icon. Exports `StageStripStage` interface. |

**Modified files:**

| File | Changes |
|---|---|
| `src/app/(app)/layout.tsx` | Replaced `Sidebar` import with `DesktopNavRail` + `BottomTabBar`. Changed bg to `bg-slate-50`. Added `pb-20 lg:pb-0` for mobile bottom bar clearance. Still imports `SidebarProvider` and `UserRoleProvider` (these are used elsewhere). |
| `src/components/layout/Header.tsx` | Removed `MobileMenuButton` import/usage (no longer needed). Removed "BuildForge" branding text. Increased desktop title to `lg:text-2xl` and padding to `lg:px-8`. |
| `src/components/dashboard/ProjectCard.tsx` | Complete rewrite — uses ProgressRing, BudgetBar, StageStrip. New layout: header with type icon + subdivision + name + progress ring, stage strip in gray-50 container, budget bar, footer with days-under-construction + todo count. Hover: shadow-md + translateY. New props: `extStages`, `intStages`, `delayedCount`. |
| `src/app/(app)/dashboard/page.tsx` | Complete rebuild. Added `getStageStripData()` function (builds EXT/INT strips from build_stages). Mobile: alert banner, quick actions grid (4 icons), compact 2×2 KPI strip. Desktop: 4-card KPI strip with shadows, "This Week" section, subdivision-grouped project cards. Right column: Needs Attention, Recent Field Logs, Quick Actions. |
| `src/app/(app)/dashboard/loading.tsx` | Updated skeleton to match new layout — mobile alert/quick-action/KPI skeletons, desktop KPI skeleton, project card skeletons with stage strip and budget bar placeholders. |
| `src/app/globals.css` | Added Inter font import, CSS custom properties, utility classes (`tabular-nums`, `no-scrollbar`, `pb-safe`), keyframe animations (`slide-up`, `slide-right`), animation classes. |

---

## Not Yet Done

### Cleanup (done)

- **`SidebarProvider` removed from layout.tsx** — confirmed only imported by dead files (Sidebar.tsx, MobileMenuButton.tsx). Layout now wraps with `UserRoleProvider` only.
- **Dead files identified but NOT deleted** (file deletion permission denied): `Sidebar.tsx`, `MobileMenuButton.tsx`, `AppShell.tsx`, `Header_clean.tsx`, `SidebarContext.tsx` — all in `src/components/layout/`. No live imports reference them.

### Phase 3 — Mobile Field Experience (done)

**Modified/rewritten files:**

| File | Description |
|---|---|
| `src/components/projects/ProjectTabs.tsx` | Complete rewrite (209 lines). Mobile: horizontal scrollable pill tabs with icons, snap scrolling, auto-centers active tab via `useRef` + `scrollTo`. Desktop: underline tabs with icons. Shortened mobile labels ("Gantt", "Stages", "Logs", "Docs"). All exported interfaces preserved for downstream imports. |
| `src/app/(app)/projects/[id]/page.tsx` | Complete rewrite (440 lines). Mobile: `ChevronLeft` back button, condensed project identity card with `ProgressRing`, horizontal scrollable quick stats strip (days, spent/budget, plan, home size, lots sold), large touch What's Next cards with `animate-pulse` dots. Desktop: full detail grid with 5 columns, What's Next in 2-column grid. |
| `src/components/projects/tabs/FieldLogsTab.tsx` | Complete rewrite (360 lines). `NewLogForm`: auto-focus textarea, cancel button, cleaner card layout. `AddTodoForm`: auto-focus input, stacked layout on mobile. `TodoRow`: full-width 48px min-height buttons, circular status indicators, urgent icon, relative dates. `LogCard`: card-based layout, bordered todo count badges. Loading skeleton and empty state. |
| `src/components/projects/tabs/StageReportTab.tsx` | Complete rewrite with dual layout. Mobile: `MobileStageCard` with stage number, name, track badge, status pill, date range, and three 44px action buttons (Complete, Edit, Skip). `MobileEditSheet` expands inline below card. Desktop: preserved table layout with `DesktopEditForm`. Track styles map and date formatting helper. |
| `src/components/projects/tabs/SelectionsTab.tsx` | Complete rewrite (261 lines). `StatusStepper`: progress dots with tap-to-advance. `SelectionItem`: row with status stepper and delete button (visible mobile, hover desktop). Summary strip with colored status pills. Empty state with `Palette` icon. |

### Phase 4 — Financial Desktop Experience (done)

**New shared components created:**

| File | Description |
|---|---|
| `src/components/ui/ReportChrome.tsx` | Shared wrapper for all financial reports. Title, subtitle, date range selector (preset pills: Month/Quarter/Year/All Time/Custom, or as-of single date), Print and Export buttons. Props: `title`, `subtitle`, `showDateRange`, `dateMode` ("range" or "asOf"), `onDateChange`, `onAsOfChange`, `extraControls`. |
| `src/components/ui/StatusDot.tsx` | Compact status indicator: colored dot + text label. 12 status mappings. Used in dense financial tables where full badges take too much space. Props: `status`, `className`. |

**Modified/rewritten files:**

| File | Changes |
|---|---|
| `src/app/globals.css` | Added keyframes: `slide-in-right`, `fade-in`, `expand-down`. Added classes: `.animate-slide-in-right`, `.animate-fade-in`, `.animate-expand-down`. |
| `src/app/(app)/invoices/page.tsx` | Added `max-w-7xl mx-auto` wrapper. Updated heading to `text-lg font-bold`. Removed inline pending count (now handled by InvoicesTable summary metrics). |
| `src/components/invoices/InvoicesTable.tsx` | Complete rewrite (628 lines). Summary metric strip (3 KPI cards: Pending, Approved, Past Due). Status filter pills with counts. Dense 36px rows with `py-2`. StatusDot for status display. Row expansion with `animate-expand-down`. Sticky header. `tabular-nums` for amounts. Hover inline actions: "Issue Check" (approved), "Mark Cleared" (released). Bulk select mode with fixed bottom action bar. Draw checkbox per row. Search + project dropdown filter. Sortable columns (status, vendor, date, due, amount). |
| `src/app/(app)/invoices/[id]/page.tsx` | Rewritten with split-view layout: `flex flex-col lg:flex-row`. Left panel: PDF preview (`lg:sticky`). Right panel: metadata cards, line items table, InvoiceDetailActions. |
| `src/components/invoices/InvoiceDetailActions.tsx` | Cleaned up and restored. Full invoice lifecycle actions: Issue Check (with early-pay discount), Mark Cleared (with date/method picker), Dispute, Void (two modes: after-draw and simple). |
| `src/components/draws/DrawsTableClient.tsx` | Rewritten with summary strip, dense rows, StatusDot, hover actions, sticky header. |
| `src/components/banking/BankAccountsClient.tsx` | Rewritten with card-based grid layout. Building2 icon, color-coded type badges (checking/savings/money market/line of credit), hover shadow, inline edit/delete. |
| `src/components/financial/FinancialSummaryClient.tsx` | Rewritten with ReportChrome wrapper, KPI cards with colored left borders and Lucide icons, balance check indicator, zebra-striped project table. |
| `src/components/financial/IncomeStatementClient.tsx` | Wrapped in ReportChrome, replaced centered DrillModal with slide-out DrillPanel, zebra striping, section totals with brand color border. |
| `src/components/financial/BalanceSheetClient.tsx` | Wrapped in ReportChrome with asOf date mode, replaced modal with slide-out drill panel, improved spacing. |
| `src/components/financial/APAgingClient.tsx` | Wrapped in ReportChrome, filter dropdowns moved to extraControls, aging buckets with colored left borders, StatusDot for invoice status, denser rows. |

### Phase 5 — Polish & Animation (done)

**New files created:**

| File | Description |
|---|---|
| `src/components/layout/PageTransition.tsx` | Client component wrapping page content. Detects route changes via `usePathname` and plays a subtle fade+slide-up entrance animation (`animate-page-enter`, 0.22s). Keyed on pathname so animation replays on navigation. |
| `src/lib/haptics.ts` | Haptic feedback utility. Exports `haptic(style)` with four presets (`light`, `medium`, `heavy`, `selection`) mapping to `navigator.vibrate()` durations. No-ops gracefully on iOS/desktop. Also exports `supportsHaptics()`. |
| `src/components/layout/ThemeProvider.tsx` | Client context provider for dark mode. Stores preference in `localStorage` (`bf-theme`). Supports `light`, `dark`, `system`. Applies `data-theme` attribute on `<html>`. Listens to `prefers-color-scheme` media query changes when in system mode. |
| `src/components/ui/ThemeToggle.tsx` | Three-way toggle (Light / Dark / System) using Lucide icons. Pill-style selector with active highlight. Ready for placement on settings page. |
| `src/app/(app)/projects/loading.tsx` | Skeleton loader for Projects list — search bar, subdivision header, 6-card grid with stage strip and budget bar placeholders. |
| `src/app/(app)/projects/[id]/loading.tsx` | Skeleton loader for Project detail — back button, identity card (mobile), quick stats strip, detail grid (desktop), tab bar, content area. |
| `src/app/(app)/invoices/loading.tsx` | Skeleton loader for AP page — 3 KPI cards, filter pills, 8-row dense table. |
| `src/app/(app)/vendors/loading.tsx` | Skeleton loader for Vendors page — search bar, 6-card grid. |
| `src/app/(app)/draws/loading.tsx` | Skeleton loader for Draw Requests — 3 summary cards, 5-row table. |
| `src/app/(app)/financial/summary/loading.tsx` | Skeleton loader for Financial Summary — ReportChrome header, 4 KPI cards with colored borders, zebra-striped table. |
| `src/app/(app)/financial/income-statement/loading.tsx` | Skeleton loader for Income Statement — date pills, 3 report sections with brand-colored section totals. |
| `src/app/(app)/financial/balance-sheet/loading.tsx` | Skeleton loader for Balance Sheet — as-of date picker, Assets/Liabilities/Equity sections. |
| `src/app/(app)/financial/ap-aging/loading.tsx` | Skeleton loader for AP Aging — 5 aging bucket cards, 6-row table. |
| `src/app/(app)/banking/accounts/loading.tsx` | Skeleton loader for Bank Accounts — 3-card grid. |
| `public/favicon.svg` | New brand-blue SVG icon (`#4272EF` background, white "BF" text). Replaces amber version. |
| `public/icon-192.png` | 192×192 PNG icon for PWA manifest. |
| `public/icon-512.png` | 512×512 PNG icon for PWA manifest. |
| `public/icon-maskable-512.png` | 512×512 maskable PNG icon for Android adaptive icons. |
| `public/apple-touch-icon.png` | 180×180 PNG for iOS home screen. |

**Modified files:**

| File | Changes |
|---|---|
| `src/app/globals.css` | Added `page-enter` keyframe + `.animate-page-enter` class (fade+translateY, 0.22s). Added `slide-down` keyframe + `.animate-slide-down` for sheet exit. Added `.sheet-dragging` class (disables transition during drag). Added `prefers-reduced-motion` media query that disables all custom animations. Expanded CSS custom properties for dark mode: `--surface`, `--surface-secondary`, `--border`, `--border-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`, `--card-shadow`. Dark values activate via `[data-theme="dark"]` or `prefers-color-scheme: dark` fallback. |
| `src/app/layout.tsx` | Added `ThemeProvider` wrapper around `{children}`. Added `Viewport` export (themeColor, viewportFit cover). Added `appleWebApp` metadata. Added `data-theme="light"` + `suppressHydrationWarning` on `<html>`. Added favicon, apple-touch-icon, and apple-mobile-web-app meta tags. |
| `src/app/(app)/layout.tsx` | Wrapped `{children}` in `<PageTransition>` component for route-level entrance animations. |
| `src/components/layout/QuickActionSheet.tsx` | Full rewrite with touch gesture support. Drag-to-dismiss via `onTouchStart/Move/End` handlers. Dismiss threshold (120px) or velocity threshold (0.5 px/ms). Backdrop opacity fades proportionally to drag distance. Exit animation (`animate-slide-down`). Body scroll lock while open. Haptic feedback on close and action tap. |
| `public/manifest.json` | Updated `theme_color` from `#f59e0b` (amber) to `#4272EF` (brand blue). Added description, orientation, scope, categories. Expanded icons array: favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png with proper purpose attributes. |
| `public/icon.svg` | Updated fill from `#f59e0b` (amber) to `#4272EF` (brand blue). Updated font to Inter. |

---

## Architecture Notes

- **Next.js App Router** with route group `(app)/` for authenticated pages
- **Tailwind CSS 4** + **Lucide React** icons (no shadcn going forward for new components — custom components instead)
- **Inter** font family, `tabular-nums` for financial figures
- **Server components** for data fetching (dashboard page is `async` server component)
- **`pb-safe`** CSS utility handles iOS safe area insets
- Files written via the Write tool sometimes get null bytes appended — run `python3 -c "data=open(f,'rb').read(); open(f,'wb').write(data.replace(b'\\x00',b''))"` if you see "Invalid character" TypeScript errors on the last line of a file
- The bash sandbox and file tools can have sync issues with large files — if tsc reports unclosed JSX tags in files you just wrote, verify the file content with `wc -l` in bash and compare against what Read shows
- **Bash heredoc escaping:** Writing TSX files via bash heredocs can turn `!` into `\!` (history expansion). Use python `open/write` instead, or single-quoted heredocs (`cat << 'EOF'`). Fix with `sed -i 's/\\!/!/g' file.tsx`

## Pre-existing TypeScript Issues

The codebase has many pre-existing unclosed-JSX-tag errors in files **not** touched by this redesign, including files under `banking/`, `draws/`, `contacts/`, and others. These cascade and inflate the total error count from `npx tsc --noEmit`. None of the new or modified files above have TypeScript errors.

---

## Key Design Decisions

1. **Bottom tab bar** (mobile) replaces the sidebar drawer — always visible, no hamburger menu
2. **Icon rail + flyout** (desktop) replaces the always-open 240px sidebar — more content space
3. **FAB center button** on mobile for quick actions (Field Log, Invoice, To-Do)
4. **Two-track stage strip** (EXT/INT) preserved on all project cards — user's favorite feature
5. **Prairie Sky Homes logo** on desktop nav rail only (not mobile — screen real estate)
6. **Shadows instead of flat borders** for card elevation — subtle `shadow-sm`, `shadow-md` on hover
7. **Mobile and desktop get different KPI layouts** — compact 2×2 on mobile, full 4-card strip on desktop
