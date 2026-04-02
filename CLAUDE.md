# CLAUDE.md — BuildForge Construction ERP

## What This App Is

A full-featured construction ERP and accounting system for a residential home builder and land developer. Functions like a contractor-specific QuickBooks — covering the full project lifecycle from land acquisition through certificate of occupancy.

Primary users are the business owners who also function as superintendents. The app must work well on mobile (iPhone on job sites) and desktop (office accounting work). UI must be clean, logical, and functional — users are not tech people.

Includes: project management, job costing, full double-entry accounting, loan/draw tracking, vendor management, interactive build stage tracking with Gantt, AI-powered invoice processing, field logs with to-do items, selections tracking, document management, and in-app notifications.

---

## Tech Stack

- **Frontend:** Next.js (React) — web + PWA
- **Database:** Supabase (Postgres)
- **Auth:** Supabase Auth
- **AI:** Anthropic Claude API (`claude-sonnet-4-20250514`) — invoice categorization
- **File Storage:** Supabase Storage
- **Email Ingestion:** Gmail API (prairiesky25@gmail.com)
- **Styling:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel

---

## Reference Files

- **Cost codes (all 120):** `.claude/memory/cost_codes.md`
- **Build stages (all 54):** `.claude/memory/build_stages.md`

Read these files when working on anything related to cost code seeding, invoice categorization, Gantt chart stages, or build stage logic.

---

## Navigation Structure

```
Project Management
├── Projects
│   ├── Land Development
│   └── Home Construction (grouped by subdivision)
├── Project Reports
│   ├── Stage Progress
│   ├── Field Logs
│   ├── Job Cost
│   ├── Budget Variance
│   └── Selections
└── Project To-Do's

Financial
├── Financial Reports
│   ├── Summary
│   ├── Income Statement
│   ├── Balance Sheet
│   ├── Cash Flow Statement
│   └── AP Aging
├── Accounts Payable
└── Banking
    ├── Bank Accounts
    ├── Loans
    └── Draw Requests

Management
├── Documents
├── Vendors
└── Contacts
```

> Financial section is company-wide (not per-project). All financial reports must support drill-down to individual GL entries.

---

## UI Conventions

- shadcn/ui + Tailwind CSS
- **Primary brand color:** `#4272EF` (Blue 40)
  - Use for: buttons, nav active states, links, CTAs, status highlights, focus rings
  - Pair with: white `#FFFFFF` backgrounds, light gray `#F8F9FA` surfaces, dark text `#1E293B`
- Clean, functional design — no unnecessary decoration
- Mobile-first for: stage tracker, field logs, to-dos, photos, and all job site use
- Desktop-optimized for: accounting, AP, draws, reporting, and document management

---

## Key Business Rules

- Cost codes 1–33 = Land Development; 34–102 = Home Construction; 103–120 = G&A (company-level only, never project-assigned)
- Only display cost codes relevant to a project's type — never show land dev codes on a home construction project or vice versa
- All financial transactions must post to the General Ledger and balance (debits = credits)
- Every approved invoice payment posts GL entry: debit AP, credit Cash
- Every funded loan draw posts GL entry: debit Cash, credit Construction Loan Payable — posted automatically when draw status changes to `funded`
- `committed_amount` = sum of active contract amounts per cost code/project
- `actual_amount` = sum of approved and paid invoices per cost code/project; for multi-line invoices, roll up from `invoice_line_items`
- Invoices with `ai_confidence: low` require manual review before any action
- All invoices require human approval before payment
- If an invoice has no `due_date`, default to the date it was entered into the system
- Vendor COI/license expiry: 30-day warning notification, blocking alert at expiry
- Vendor trade must be selected from cost code list — not freeform
- Draw request pulls invoices where `pending_draw = true` and `status = 'approved'` and not yet funded in a prior draw
- Draws are weekly batch submissions to the bank; once funded, invoices in that draw are locked and cannot be re-drawn
- When a build stage is marked complete, future stages in the Gantt automatically adjust
- Build stage end date is auto-calculated from `start_date` + cumulative stage durations from `.claude/memory/build_stages.md`
- Notifications fire for: past-due invoices, invoices pending review, COI/license expiring within 30 days, and COI/license already expired
- G&A invoices (codes 103–120) are company-level only — `project_id` is null on these records
- Multi-line invoice line items must sum to the parent invoice `amount`; a mismatch is a validation error
- Financial reports are company-wide and must support drill-down to individual GL entries

---

## Database Schema

### projects

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | string | |
| address | string | |
| type | string | `'home_construction'`, `'land_development'` |
| status | string | `'active'`, `'completed'`, `'on_hold'`, `'pre_construction'` |
| contract_price | decimal | Not collected at creation — set later when known |
| subdivision | string | nullable — groups home construction projects |
| estimated_start_date | date | Used for budgeted Gantt in pre-construction |
| estimated_completion_date | date | Auto-calculated from build stage durations — never entered manually |
| owner_id | uuid | FK → users.id |
| lender_id | uuid | FK → contacts.id (nullable) — used for lender/bank filtering |
| start_date | date | Actual start date |
| target_close_date | date | Auto-calculated; editable |
| created_at | timestamp | |
| block | string | nullable — Home Construction only |
| lot | string | nullable — Home Construction only |
| lot_size_acres | decimal | nullable — Home Construction only |
| plan | string | nullable — Home Construction only (house plan/model name) |
| home_size_sf | int | nullable — Home Construction only (square footage) |
| size_acres | decimal | nullable — Land Development only |
| number_of_lots | int | nullable — Land Development only |
| number_of_phases | int | nullable — Land Development only |

> **Project creation forms are type-specific.** Home Construction form collects: name, address, subdivision, block, lot, lot size, plan, home size, start date, lender. Land Development form collects: name, address, size (acres), number of lots, number of phases, start date, lender. Budget and end date are NOT collected at creation.
>
> **Cost code defaults at creation:** All applicable cost codes for the project type are pre-selected; user deselects any that don't apply. If adding a home construction project to an existing subdivision, auto-match cost codes and build stages from the most recently added project in that subdivision.
>
> **Build stage auto-population:** On project creation, build stages are automatically populated based on the start date and the `days_to_complete` values in `.claude/memory/build_stages.md`. End date is derived from this schedule.

---

### cost_codes (master list)

| Column | Type | Notes |
|---|---|---|
| code | int | PK |
| description | string | |
| category | string | `'land_development'`, `'home_construction'`, or `'general_admin'` |

---

### project_cost_codes

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| cost_code | int | FK → cost_codes.code |
| budget_amount | decimal | Per-code budget for this project |
| enabled | boolean | default true — allows enabling/disabling cost codes per project/subdivision |
| created_at | timestamp | |

> G&A cost codes (103–120) are never added to `project_cost_codes` — they are company-level only.

---

### contacts

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | string | |
| type | string | `'lender'`, `'owner'`, `'other'` |
| email | string | nullable |
| phone | string | nullable |
| created_at | timestamp | |

---

### vendors

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | string | |
| trade | string | nullable — must be selected from cost code list (not freeform) |
| email | string | nullable |
| phone | string | nullable |
| coi_expiry_date | date | nullable — triggers notification at 30 days, blocks at expiry |
| license_expiry_date | date | nullable — triggers notification at 30 days, blocks at expiry |
| created_at | timestamp | |

> **Trade field:** The "Select Trade" dropdown must be populated from the cost code master list descriptions — not a freeform text field.

---

### contracts

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| vendor_id | uuid | FK → vendors.id |
| cost_code | int | FK → cost_codes.code |
| description | string | |
| amount | decimal | |
| status | string | `'active'`, `'completed'`, `'cancelled'` |
| signed_date | date | nullable |
| created_at | timestamp | |

---

### invoices

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id (nullable — null for G&A invoices) |
| vendor_id | uuid | FK → vendors.id (nullable) |
| contract_id | uuid | FK → contracts.id (nullable) |
| cost_code | int | FK → cost_codes.code — primary/default cost code for single-line invoices |
| invoice_number | string | |
| invoice_date | date | |
| due_date | date | Required — defaults to entry date if not provided |
| amount | decimal | Total invoice amount (sum of all line items) |
| status | string | `'pending_review'`, `'approved'`, `'scheduled'`, `'paid'`, `'disputed'` |
| payment_date | date | nullable |
| payment_method | string | `'check'`, `'ach'`, `'wire'`, `'credit_card'` (nullable) |
| ai_confidence | string | `'high'`, `'medium'`, `'low'` |
| ai_notes | text | |
| source | string | `'email'`, `'upload'` |
| pending_draw | boolean | default false — flagged to be included in next draw request |
| created_at | timestamp | |

> **Invoice filename convention:** When an invoice is stored, the description/display name is formatted as: `Vendor Name – Cost Code – Project Name – Invoice Number`
>
> **Multi-line invoices:** Invoices can have multiple line items, each attributed to a different cost code (see `invoice_line_items` table below). The `cost_code` on the parent invoice record is the primary code for single-line invoices or the dominant code for multi-line.
>
> **Add to draw:** When approving or entering an invoice, prompt: "Add to pending draw request?" If yes, set `pending_draw = true`.

---

### invoice_line_items

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| invoice_id | uuid | FK → invoices.id |
| cost_code | int | FK → cost_codes.code |
| description | string | |
| amount | decimal | |
| created_at | timestamp | |

> Used when a single invoice spans multiple cost codes. If only one line item exists, it mirrors the parent invoice. The sum of all line item amounts must equal `invoices.amount`.

---

### field_logs

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| build_stage_id | uuid | FK → build_stages.id (nullable) |
| log_date | date | |
| notes | text | |
| created_by | uuid | FK → users.id |
| created_at | timestamp | |

---

### field_todos

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| field_log_id | uuid | FK → field_logs.id (nullable) |
| description | string | |
| status | string | `'open'`, `'in_progress'`, `'done'` |
| priority | string | `'low'`, `'normal'`, `'urgent'` |
| due_date | date | nullable |
| resolved_date | date | nullable |
| created_by | uuid | FK → users.id |
| created_at | timestamp | |

---

### selections

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| category | string | e.g. `'Flooring'`, `'Countertops'`, `'Cabinets'`, `'Paint'`, `'Tile'`, `'Appliances'`, `'Fixtures'`, `'Doors & Hardware'`, `'Windows'`, `'Exterior'` |
| item_name | string | |
| status | string | `'pending'`, `'selected'`, `'ordered'`, `'delivered'`, `'installed'` |
| notes | text | nullable |
| cost_code | int | FK → cost_codes.code (nullable) |
| created_at | timestamp | |

---

### documents

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id (nullable — some docs are company-level) |
| vendor_id | uuid | FK → vendors.id (nullable) |
| folder | string | `'Plans'`, `'Permits'`, `'Contracts'`, `'Lender'`, `'Inspections'`, `'Photos'`, `'Other'` |
| file_name | string | |
| storage_path | string | Supabase Storage path |
| file_size_kb | int | |
| mime_type | string | |
| notes | text | nullable |
| uploaded_by | uuid | FK → users.id |
| created_at | timestamp | |

> **Storage discipline:** No design photos, no selection images, no duplicate PDFs. Documents are for reference files only. Enforce a per-project soft warning at 500MB. Invoice PDFs/images stored separately in the `invoices` bucket.

---

### notifications

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id |
| type | string | `'invoice_past_due'`, `'invoice_pending_review'`, `'coi_expiring'`, `'coi_expired'`, `'license_expiring'`, `'license_expired'` |
| reference_id | uuid | ID of the related record |
| reference_type | string | `'invoice'`, `'vendor'` |
| message | string | |
| is_read | boolean | default false |
| created_at | timestamp | |

> Generated by scheduled Supabase Edge Function. In-app only — no email or SMS.

---

### gl_entries

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id (nullable) |
| entry_date | date | |
| description | string | |
| debit_account | string | Chart of accounts code |
| credit_account | string | Chart of accounts code |
| amount | decimal | |
| source_type | string | `'invoice_payment'`, `'loan_draw'`, `'manual'` |
| source_id | uuid | FK to the originating record |
| created_at | timestamp | |

---

### loan_draws

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| lender_id | uuid | FK → contacts.id |
| draw_number | int | |
| draw_date | date | |
| total_amount | decimal | |
| status | string | `'draft'`, `'submitted'`, `'funded'` |
| notes | text | nullable |
| created_at | timestamp | |

---

### draw_invoices (join table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| draw_id | uuid | FK → loan_draws.id |
| invoice_id | uuid | FK → invoices.id |

---

### build_stages (per project)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| stage_number | int | FK → master stage list in `.claude/memory/build_stages.md` |
| status | string | `'not_started'`, `'in_progress'`, `'complete'`, `'delayed'` |
| planned_start_date | date | |
| planned_end_date | date | |
| actual_start_date | date | nullable |
| actual_end_date | date | nullable |
| baseline_start_date | date | Snapshot of original plan — never auto-adjusted |
| baseline_end_date | date | Snapshot of original plan — never auto-adjusted |
| notes | text | nullable |
| created_at | timestamp | |

---

### project_phases (Land Development only)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| phase_number | int | Sequential (1, 2, 3…) |
| name | string | e.g. "Phase 1 – 15 acres" |
| size_acres | decimal | nullable |
| number_of_lots | int | nullable |
| lots_sold | int | default 0 |
| status | string | `'not_started'`, `'in_progress'`, `'complete'` |
| notes | text | nullable |
| created_at | timestamp | |

> Cost codes and stages can be assigned at the phase level for land development projects. `lots_sold` is manually updated and drives "remaining lots" display.

---

## Feature Modules & Build Priority

### 1. Auth & Setup
- Supabase Auth (email/password)
- App settings: company name, logo, default cost codes
- Master cost code list seeded on first run (all 120 codes — see `.claude/memory/cost_codes.md`)

### 2. Vendor Management
- CRUD for vendors
- Trade field is a dropdown sourced from cost code descriptions — not freeform
- COI and license expiry tracking
- Link vendors to contracts and invoices

### 3. Project Management
- Two distinct project types: **Land Development** and **Home Construction** — treated separately throughout the app
- **Home Construction creation form:** name, address, subdivision, block, lot, lot size (acres), plan, home size (SF), start date, lender
- **Land Development creation form:** name, address, size (acres), number of lots, number of phases, start date, lender
- Budget (`contract_price`) and end date are NOT collected at creation — budget set later per cost code; end date auto-calculated
- Cost codes pre-selected by type on creation; user deselects inapplicable ones
- If adding a home to an existing subdivision, auto-copy cost codes and build stages from the most recent project in that subdivision
- Build stages auto-populated from start date using duration values in `.claude/memory/build_stages.md`
- Enable/disable cost codes per project (land dev + home construction only; never G&A)
- Budget entry per cost code (done post-creation)
- Land Development supports phases (see `project_phases` table) — each phase has its own acreage, lot count, and sold/remaining tracking

**Project page tab layout — Home Construction:**
- Stage Report (build stages + Gantt)
- Cost Items (cost codes — construction types only)
- Budget
- Selections
- Field Logs
- Documents

**Project page tab layout — Land Development:**
- Stage Report (build stages + Gantt)
- Cost Items (cost codes — land dev types only)
- Budget
- Field Logs
- Documents

**Project tile (card view) must display:**
- All fields entered at creation
- Days under construction (calculated from `start_date`)
- Home Construction: subdivision, block/lot, plan, home size
- Land Development: size (acres), total lots, sold lots, remaining lots

### 4. Accounts Payable & Invoice Management
- Manual invoice entry + email ingestion via Gmail API
- **Multi-line invoices:** A single invoice can have multiple line items, each assigned to a different cost code (stored in `invoice_line_items`). Total must equal invoice `amount`
- **AI autofill from PDF:** When a PDF is uploaded, AI attempts to extract and pre-fill all fields including line items and cost codes
- **Invoice filename/description:** Auto-formatted as `Vendor Name – Cost Code – Project Name – Invoice Number`
- **Add to draw prompt:** When entering or approving an invoice, ask "Add to pending draw request?" — if yes, set `pending_draw = true`
- AI categorization via Claude API — see Invoice Processing Rules below
- Approval workflow: pending_review → approved → scheduled → paid
- `ai_confidence: low` flags require manual review — cannot be approved without human touch
- GL entry posted on payment
- G&A invoices (codes 103–120) entered without a project — `project_id` is null
- Only display cost codes relevant to the invoice's project type

### 5. Project Dashboard
- Budget vs committed vs actual by enabled cost codes only
- Variance indicators
- P&L summary
- Active loans and draw balance
- Subdivision selector for grouped views

### 6. Build Stage Tracker + Interactive Gantt Chart
- All 54 stages — see `.claude/memory/build_stages.md` for full list and Gantt track assignments
- Two-track layout: Exterior and Interior
- Budgeted Gantt during pre-construction (uses auto-calculated dates from stage durations)
- When a stage is marked complete, future stages automatically shift
- Baseline dates locked at project start for deviation tracking
- Color-coded status and delay highlighting
- Zoomable, scrollable, exportable to PDF
- Subdivision-level Gantt view (all homes in one subdivision)
- Field log and to-do creation directly from a stage
- Land Development and Home Construction have distinct stage sets

### 7. Field Logs & To-Dos
- Log entry tied to project and optionally a build stage
- Add to-do items from within a log or standalone
- To-do fields: description, priority, due date, status
- Mobile-optimized: large tap targets, minimal typing
- Logs read-only once saved; to-dos updatable at any time

### 8. Selections Tracker
- Home Construction projects only
- Status board per project — no images, no uploads
- Categories: Flooring, Countertops, Cabinets, Paint, Tile, Appliances, Fixtures, Doors & Hardware, Windows, Exterior
- Status flow: Pending → Selected → Ordered → Delivered → Installed
- Optional short notes per item; linked to cost code (optional)

### 9. Banking (Loans & Draw Management)
- Navigation section is called "Banking" with three sub-pages: Bank Accounts, Loans, Draw Requests
- **Loans:** Created manually from the Loans page or auto-created when a loan number is entered on a project. Each loan is linked to a project and a lender contact, and has a loan number, loan amount, interest rate, origination date, maturity date, and status
- **Loan types:** `term_loan` (fixed amount, fully funded at origination) and `line_of_credit` (revolving — has a credit limit and a current outstanding balance). For lines of credit, display: credit limit, current balance, and available credit (credit limit minus current balance)
- If a loan number is entered on a project's edit page, automatically create a loan record for that project if one does not already exist for that loan number
- **Draw process is a weekly batch:** Pull all approved invoices with `pending_draw = true` not yet in a funded draw, grouped by lender. A single draw request can include invoices across multiple loans from the same lender
- Highlights invoices due within 5 days or past due
- Draw Request Report: summary page + attached invoice PDFs, single PDF export
- Mark draw as submitted to bank
- When draw is marked `funded`: GL entry posts automatically (debit Cash, credit Construction Loan Payable) and invoices in the draw are locked from future draws

### 10. Document Management
- Per-project Documents tab: Plans, Permits, Contracts, Lender, Inspections, Photos, Other
- Company-level folder for non-project documents
- Vendor document uploads (COI, license) linked to vendor record
- Drag-and-drop or mobile camera upload
- Stored in Supabase Storage — no local sync; standard cloud storage approach
- Soft storage warning at 500MB per project; warn if file > 25MB
- In-browser preview for PDFs and images

### 11. Notifications
- Bell icon with unread count badge
- In-app only
- Types: invoice past due, invoice pending review, COI expiring/expired, license expiring/expired
- Generated by Supabase Edge Function (scheduled)
- Mark as read individually or all at once

### 12. Reporting

**Financial Reports (company-wide — accessible from Financial nav section):**
- Summary (dashboard overview)
- Income Statement
- Balance Sheet
- Cash Flow Statement
- AP Aging
- All financial reports support drill-down to individual GL entries
- WIP Report
- Vendor Spend
- Tax Package Export (GL, P&L, paid invoices, vendor totals — yearly, one-click)

**Project Reports (accessible from Project Management nav section):**
- Stage Progress Report
- Field Logs Report
- Job Cost Report (enabled cost codes only)
- Budget Variance Report
- Selections Status Report
- Interactive Gantt Chart Report (baseline vs actual overlay)
- Subdivision Overview Dashboard
- Draw Request Report (summary + attached invoices)

---

## Invoice Processing Rules

### Model
- Always use `claude-sonnet-4-20250514` for all invoice extraction and categorization
- Enable prompt caching on system prompt + extraction schema for repeated calls
- Never use Haiku for primary invoice processing

### Pipeline (Gmail-scraped and manual uploads — identical treatment)
1. Extract fields: vendor, invoice number, date, due date, amount, and all line items
2. For each line item, categorize to a cost code using `.claude/memory/cost_codes.md`
3. Match to project if determinable
4. Output structured JSON matching both the `invoices` and `invoice_line_items` table schemas
5. Set `ai_confidence` (high/medium/low) based on extraction certainty across all fields
6. If `ai_confidence: low` on any key field — flag for human review, do not auto-approve
7. G&A invoices (codes 103–120): set `project_id` to null
8. Auto-format description as: `Vendor Name – Primary Cost Code – Project Name – Invoice Number`

### Constraints
- Never invent cost codes not in the master list (`.claude/memory/cost_codes.md`)
- Batch API calls where possible; use prompt caching aggressively
- All outputs must be valid parseable JSON
- Validate: amount > 0, date is parseable, vendor is not blank
- Do not auto-approve any invoice — human approval always required

---

## Gmail Invoice Ingestion Flow

1. Email arrives at prairiesky25@gmail.com with invoice attachment (PDF or image)
2. Gmail API polls for new messages with attachments
3. Attachment extracted and stored in Supabase Storage (`invoices` bucket)
4. Claude API processes attachment: extracts vendor, amount, invoice number, date, suggests cost code + project
5. Invoice record created with `status: 'pending_review'` and appropriate `ai_confidence`
6. If `ai_confidence: low`, notification generated for manual review
7. User reviews, corrects if needed, and approves

---

## Developer Notes

- Explain things clearly with exact commands
- Build and test one feature at a time — do not bundle unrelated features
- Cost codes master list: `.claude/memory/cost_codes.md` (codes 1–120)
- Build stages master list: `.claude/memory/build_stages.md` (54 stages)
- Always seed the `cost_codes` master table on first run (all 120 codes)
- All monetary values stored as `decimal(12,2)`
- Supabase RLS enabled; policies scoped to `auth.uid() = owner_id`
- GMT timestamps throughout; display in user's local time
- File uploads: `documents` bucket for docs; `invoices` bucket for invoice attachments
- Keep storage lean — no auto-upload of images unless user explicitly attaches them
