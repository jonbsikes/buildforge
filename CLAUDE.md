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
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`) — invoice categorization
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

- Cost codes are categorized by `project_type` column on the `cost_codes` table: `land_development`, `home_construction`, or `general_admin`. Do NOT use hardcoded numeric ranges to filter — always filter by `project_type`.
- Current ranges (informational only, not used for filtering): Land Development 1–33 + 121; Home Construction 34–102 + 122; G&A 103–120
- Codes 121 (Land Dev) and 122 (Home Construction) = **Loan Interest** — always capitalized into WIP/CIP, never expensed. See interest capitalization policy below.
- G&A codes (`project_type = 'general_admin'`) are company-level only — `project_id` must be null on all invoices using these codes
- Only display cost codes relevant to a project's type — never show land dev codes on a home construction project or vice versa
- All financial transactions must post to the General Ledger and balance (debits = credits)

### Interest Capitalization Policy (ASC 835-20)

**All project-level interest is capitalized into WIP/CIP — it never hits the income statement.**

The JE debit account is driven by the **project type on the invoice**, not the cost code. This means every invoice attached to a project (including Loan Interest codes 121/122) automatically debits the correct WIP/CIP account:

- Home Construction project → DR **Construction WIP (1210)**
- Land Development project → DR **CIP — Land Improvements (1230)**
- No project (G&A) → DR **G&A Expense (6900)** — hits the income statement

This is correct GAAP treatment: construction loan interest on qualifying assets must be capitalized as part of the cost of those assets for the duration of construction.

**Code 110 "Interest Expense" (G&A, codes 103–120)** is reserved for company-level interest only — e.g., interest on an operating line of credit. It is always company-level (`project_id = null`) and always hits 6900 / the income statement. Never use code 110 for construction loan interest.

Do NOT create a separate balance sheet "Interest Payable" or "Accrued Interest" account for project loan interest. It flows through AP (standard path) or directly to Cash (auto-draft path) and lands in WIP/CIP — no separate interest account is needed or correct.
- The authoritative GL system is `journal_entries` + `journal_entry_lines` (double-entry). The old `gl_entries` table is legacy — do not write new entries to it
- All journal entries post automatically at the correct lifecycle event — see **Automated Journal Entry Triggers** section
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
- G&A invoices (`project_type = 'general_admin'`) are company-level only — `project_id` is null on these records
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

> G&A cost codes (`project_type = 'general_admin'`) are never added to `project_cost_codes` — they are company-level only.

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
| cost_code_id | uuid | FK → cost_codes.id — dominant cost code for this invoice |
| invoice_number | string | |
| invoice_date | date | |
| due_date | date | Required — defaults to entry date if not provided |
| amount | decimal | Total invoice amount (sum of all line items) |
| status | string | `'pending_review'`, `'approved'`, `'released'`, `'cleared'`, `'disputed'`, `'void'` |
| payment_date | date | nullable — set when check clears bank (status = `cleared`) |
| payment_method | string | `'check'`, `'ach'`, `'wire'`, `'credit_card'` (nullable) |
| ai_confidence | string | `'high'`, `'medium'`, `'low'` |
| ai_notes | text | |
| source | string | `'email'`, `'upload'` |
| pending_draw | boolean | default false — flagged to be included in next draw request |
| wip_ap_posted | boolean | default false — true once DR WIP / CR AP JE has been posted; prevents double-posting if invoice passes through both approval and draw funding |
| email_message_id | string | nullable — Gmail message ID for email-ingested invoices (prevents duplicates) |
| created_at | timestamp | |

> **Invoice status lifecycle:**
> - `pending_review` → created, awaiting human approval
> - `approved` → human approved; WIP/AP JE auto-posted (DR WIP / CR AP)
> - `released` → check written; AP/2050 JE auto-posted (DR AP / CR Checks Outstanding)
> - `cleared` → check cleared bank; 2050/Cash JE auto-posted (DR Checks Outstanding / CR Cash)
> - `disputed` → flagged, no payment actions available
> - `void` → voided, no further action
>
> **Invoice filename convention:** When an invoice is stored, the description/display name is formatted as: `Vendor Name – Cost Code – Project Name – Invoice Number`
>
> **Multi-line invoices:** Invoices can have multiple line items, each attributed to a different cost code (see `invoice_line_items` table below). The `cost_code_id` on the parent invoice record is the dominant cost code.
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
| status | string | `'draft'`, `'submitted'`, `'funded'` — see draw lifecycle below |
| notes | text | nullable |
| created_at | timestamp | |

> **Draw status lifecycle:**
> - `draft` → being assembled; no JE posted
> - `submitted` → sent to bank; JE auto-posted: DR Due from Lender (1120) / CR Loan Payable (220x)
> - `funded` → bank wired money; two JEs auto-posted: (1) DR Cash / CR 1120, (2) DR WIP / CR AP for any invoices not yet WIP-posted; `loans.current_balance` auto-incremented per project

---

### draw_invoices (join table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| draw_id | uuid | FK → loan_draws.id |
| invoice_id | uuid | FK → invoices.id |

---

### vendor_payments

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| draw_id | uuid | FK → loan_draws.id |
| vendor_id | uuid | FK → vendors.id (nullable) |
| vendor_name | string | |
| amount | decimal | |
| status | string | `'pending'`, `'paid'` |
| check_number | string | nullable |
| payment_date | date | nullable |
| created_at | timestamp | |

> Created automatically when a draw is funded — one record per vendor in the draw. When `markVendorPaymentPaid` is called: JE posts DR AP / CR Checks Outstanding (2050) and invoice status advances to `released`. Draw auto-closes when all vendor_payments are paid.

---

### vendor_payment_invoices (join table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vendor_payment_id | uuid | FK → vendor_payments.id |
| invoice_id | uuid | FK → invoices.id |

---

### loans

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| lender_id | uuid | FK → contacts.id |
| loan_number | string | |
| loan_amount | decimal | Total loan commitment |
| current_balance | decimal | Outstanding balance — auto-incremented when draw is funded |
| interest_rate | decimal | nullable |
| origination_date | date | nullable |
| maturity_date | date | nullable |
| status | string | `'active'`, `'paid_off'`, `'cancelled'` |
| coa_account_id | uuid | FK → chart_of_accounts.id — maps this loan to its specific liability account |
| created_at | timestamp | |

---

### chart_of_accounts

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| account_number | string | e.g. `'1000'`, `'2050'`, `'2201'` |
| name | string | e.g. `'Cash'`, `'Checks Issued - Outstanding'` |
| account_type | string | `'asset'`, `'liability'`, `'equity'`, `'revenue'`, `'expense'` |
| created_at | timestamp | |

> Key accounts used by automated JE posting: 1000 (Cash), 1120 (Due from Lender), 1210 (Construction WIP), 1230 (CIP — Land), 2000 (Accounts Payable), 2050 (Checks Issued - Outstanding), 220x (per-loan Loan Payable accounts), 6900 (G&A Expense).

---

### journal_entries

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| entry_date | date | |
| reference | string | e.g. `INV-APPR-{id}`, `DRAW-FUND-{id}`, `CHK-CLR-{id}` |
| description | string | |
| status | string | `'posted'`, `'draft'`, `'void'` |
| source_type | string | `'invoice_approval'`, `'invoice_payment'`, `'loan_draw'`, `'manual'` |
| source_id | uuid | FK to the originating record |
| loan_id | uuid | FK → loans.id (nullable) |
| user_id | uuid | FK → users.id |
| created_at | timestamp | |

---

### journal_entry_lines

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| journal_entry_id | uuid | FK → journal_entries.id |
| account_id | uuid | FK → chart_of_accounts.id |
| project_id | uuid | FK → projects.id (nullable — null for company-level entries) |
| description | string | |
| debit | decimal | |
| credit | decimal | |
| created_at | timestamp | |

> The balance sheet, income statement, and all financial reports read from `journal_entries` + `journal_entry_lines` where `status = 'posted'`. Every JE must balance (sum of debits = sum of credits).

---

### gl_entries ⚠️ LEGACY

> **Do not write new entries to this table.** It is an older simplified single-line GL table retained for historical data only. All new accounting entries go to `journal_entries` + `journal_entry_lines`.

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

## Feature Modules

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
- Gantt Chart
- Stage Report
- Cost Items (cost codes — construction types only)
- Budget
- Selections
- Field Logs
- Documents

**Project page tab layout — Land Development:**
- Gantt Chart
- Stage Report
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
- **Approval workflow:** `pending_review` → `approved` → `released` → `cleared` (see status lifecycle in schema section)
- `ai_confidence: low` flags require manual review — cannot be approved without human touch
- Journal entries post automatically at each lifecycle stage — see **Automated Journal Entry Triggers** section
- G&A invoices (codes 103–120) entered without a project — `project_id` is null
- Only display cost codes relevant to the invoice's project type
- **AP tab actions:** "Issue Check" button appears on `approved` invoices (hover); "Mark Cleared" button appears on `released` invoices (hover). Both post the correct JEs automatically. For a specific cleared date, use the invoice detail page.

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
- **Loans:** Created manually from the Loans page or auto-created when a loan number is entered on a project. Each loan is linked to a project and a lender contact, and has a loan number, loan amount, interest rate, origination date, maturity date, and status. `current_balance` is auto-incremented when a draw is funded
- **Loan types:** `term_loan` (fixed amount, fully funded at origination) and `line_of_credit` (revolving — has a credit limit and a current outstanding balance). For lines of credit, display: credit limit, current balance, and available credit (credit limit minus current balance)
- If a loan number is entered on a project's edit page, automatically create a loan record for that project if one does not already exist for that loan number
- **Draw process is a weekly batch:** Pull all approved invoices with `pending_draw = true` not yet in a funded draw, grouped by lender. A single draw request can include invoices across multiple loans from the same lender
- Highlights invoices due within 5 days or past due
- Draw Request Report: summary page + attached invoice PDFs, single PDF export
- **Draw lifecycle and automated accounting** — see **Automated Journal Entry Triggers** section
- Once funded, `vendor_payments` records are auto-created (one per vendor). Use the draw detail page to record individual checks via "Mark Vendor Paid"
- There is no "Mark Draw Paid" shortcut — all payments go through the individual vendor payment workflow to ensure proper 2050 accounting

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

## Automated Journal Entry Triggers

All journal entries are posted automatically by server actions. **Never manually replicate these entries** — doing so will cause duplicate GL postings. The `wip_ap_posted` flag on `invoices` is the guard against double-posting.

### Invoice lifecycle (all invoices — draw-based or not)

**Standard AP path** (`direct_cash_payment = false`):

| Event | Action file | JE posted |
|---|---|---|
| Invoice approved | `approveInvoice()` | DR WIP (1210/1230) or G&A Expense (6900) / CR Accounts Payable (2000). Sets `wip_ap_posted = true` |
| Check issued (`released`) | `advanceInvoiceStatus(id, 'released')` | DR Accounts Payable (2000) / CR Checks Issued - Outstanding (2050) |
| Check cleared bank (`cleared`) | `advanceInvoiceStatus(id, 'cleared', date)` | DR Checks Issued - Outstanding (2050) / CR Cash (1000) |

**Auto-draft path** (`direct_cash_payment = true` — used for bank auto-drafted loan interest):

| Event | Action file | JE posted |
|---|---|---|
| Invoice approved | `approveInvoice()` | DR WIP (1210/1230) / CR Cash (1000). Single entry. Status advances directly to `cleared`. Sets `wip_ap_posted = true`, `payment_method = 'ach'`, `payment_date = today`. No AP, no draw, no check issuance. |

**Post-approval auto-draft path** (for invoices approved via the standard AP path that the user later discovers were auto-drafted by the bank):

| Event | Action file | JE posted |
|---|---|---|
| Mark approved invoice as auto-drafted | `payInvoiceAutoDraft()` | DR Accounts Payable (2000) / CR Cash (1000). Single entry, no 2050 hop (no check was issued). Status advances from `approved` directly to `cleared`. Requires `wip_ap_posted = true` (the AP balance being cleared). Also creates a Payment Register row with `payment_method = 'auto_draft'`, `funding_source = 'dda'`. |

> Account selection for WIP/CIP debit (standard + auto-draft paths): no project → 6900 (G&A Expense); land development project → 1230 (CIP — Land); home construction project → 1210 (Construction WIP). This is determined by project type, never by cost code.

### Draw lifecycle

| Event | Action file | JE posted |
|---|---|---|
| Draw submitted | `submitDraw()` | DR Due from Lender (1120) / CR Draws Pending Funding (2060) |
| Draw funded | `fundDraw()` | (1) DR Cash (1000) / CR Due from Lender (1120); (2) DR Draws Pending Funding (2060) / CR per-loan Loan Payable (220x) — **this is when the loan balance increases**; (3) DR WIP / CR AP for any invoices with `wip_ap_posted = false`. Also increments `loans.current_balance` per project |
| Vendor payment recorded | `markVendorPaymentPaid()` | DR Accounts Payable (2000) / CR Checks Issued - Outstanding (2050). Invoice status → `released` |
| Check cleared bank | `advanceInvoiceStatus(id, 'cleared', date)` | DR Checks Issued - Outstanding (2050) / CR Cash (1000). Invoice status → `cleared` |

> **Draws Pending Funding (2060)** is a current liability that acts as a transitory holding account. It is debited at draw submission (DR 1120 / CR 2060) and cleared at funding (DR 2060 / CR Loan Payable). The Loan Payable balance only increases when cash is actually received — never at submission. This prevents premature inflation of the loan balance on the balance sheet.

### Key accounts

| Account | Number | Type |
|---|---|---|
| Cash (DDA) | 1000 | Asset |
| Due from Lender | 1120 | Asset |
| Construction WIP | 1210 | Asset |
| CIP — Land Improvements | 1230 | Asset |
| Accounts Payable | 2000 | Liability |
| Checks Issued - Outstanding | 2050 | Liability |
| Draws Pending Funding | 2060 | Liability |
| Construction Loan Payable (per loan) | 2201–229x | Liability |
| G&A / Misc Operating Expense | 6900 | Expense |

### Source files
- `src/app/actions/invoices.ts` — `approveInvoice`, `advanceInvoiceStatus`, `payInvoiceAutoDraft`
- `src/app/actions/draws.ts` — `submitDraw`, `fundDraw`, `markVendorPaymentPaid`

---

## Invoice Processing Rules

### Model
- Always use `claude-sonnet-4-6` for all invoice extraction and categorization
- Enable prompt caching on system prompt + extraction schema for repeated calls
- Never use Haiku for primary invoice processing

### Pipeline (Gmail-scraped and manual uploads — identical treatment)
1. Extract fields: vendor, invoice number, date, due date, amount, and all line items
2. For each line item, categorize to a cost code using `.claude/memory/cost_codes.md`
3. Match to project if determinable
4. Output structured JSON matching both the `invoices` and `invoice_line_items` table schemas
5. Set `ai_confidence` (high/medium/low) based on extraction certainty across all fields
6. If `ai_confidence: low` on any key field — flag for human review, do not auto-approve
7. G&A invoices (`project_type = 'general_admin'`): set `project_id` to null
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

- Cost codes master list: `.claude/memory/cost_codes.md` (codes 1–120)
- Build stages master list: `.claude/memory/build_stages.md` (54 stages)
- Always seed the `cost_codes` master table on first run (all 120 codes)
- All monetary values stored as `decimal(12,2)`
- Supabase RLS enabled; policies scoped to `auth.uid() = owner_id`
- GMT timestamps throughout; display in user's local time
- File uploads: `documents` bucket for docs; `invoices` bucket for invoice attachments
- Keep storage lean — no auto-upload of images unless user explicitly attaches them
- **Supabase type fix:** `@supabase/ssr` passes Schema as 3rd generic but `supabase-js 2.101+` expects SchemaName (string). In `server.ts` and `client.ts`, cast the client: `return client as unknown as SupabaseClient<Database>;`
- **Action file architecture:** All server actions live in `src/app/actions/`. There are no route-level `actions.ts` files under `src/app/(app)/**`. Current files: `banking.ts`, `bank-transactions.ts`, `contacts.ts`, `contracts.ts`, `cost-codes.ts`, `create-project.ts`, `documents.ts`, `draws.ts`, `field-logs.ts`, `invoice-batch.ts`, `invoices.ts`, `journal-entries.ts`, `notifications.ts`, `payments.ts`, `project-costs.ts`, `projects.ts`, `stages.ts`, `todos.ts`, `vendors.ts`
- **GL system:** Write all new journal entries to `journal_entries` + `journal_entry_lines`. The `gl_entries` table is legacy — do not use it for new entries
- **`wip_ap_posted` flag:** Set to `true` on an invoice once DR WIP / CR AP has been posted. `fundDraw` checks this flag before posting WIP/AP to prevent double-entry. Always check this flag when writing any code that might post WIP/AP entries
- **`loans.current_balance`:** Auto-incremented by `fundDraw` — do not manually update unless correcting historical data
