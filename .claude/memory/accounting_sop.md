# BuildForge Accounting SOP

Standard Operating Procedures for all financial data entry and journal entry automation in BuildForge. Read this file in full before performing any financial data operations.

---

## Table of Contents

1. Guiding Principles
2. Chart of Accounts (Active)
3. Key Schema Linkages
4. Invoice Lifecycle and Statuses
5. Workflow A: Standard Invoice (Bank-Paid via Draw)
6. Workflow B: Owner Direct Payment
7. Workflow C: Credit Memo
8. Workflow D: Invoice Dispute
9. Project Opening Entry (HUD-1 / Settlement Statement)
10. GL Entry Rules
11. Draw Request Process
12. Balance Verification Checks
13. Reporting Implications

---

## 1. Guiding Principles

- Every financial event produces automatic, balanced journal entries (debits = credits).
- AP stays open until a check clears the bank (not when the check is written).
- The contra-cash account (1050) tracks checks written but not yet posted at the bank.
- Draw submission is a status change only -- no journal entry until the bank funds.
- Cost codes map directly to GL accounts via `cost_codes.gl_account_id`. Never hard-code account numbers when the mapping exists.
- Each loan maps to a specific liability account via `loans.coa_account_id`. Never hard-code loan accounts.
- G&A invoices (cost codes 103-120) have `project_id = null` and debit expense accounts (6XXX), not WIP.
- Multi-line journal entries share a `transaction_group_id` in gl_entries.
- All journal entries store `cost_code_id` and `loan_id` where applicable for drill-down reporting.

---

## 2. Chart of Accounts (Active)

### Assets (1XXX)

| Account | Name | Subtype | Purpose |
|---------|------|---------|---------|
| 1000 | Cash - Operating Account | cash | Primary checking -- all draws received, all checks written |
| 1010 | Cash - Construction Draw Account | cash | Secondary cash account |
| 1020 | Petty Cash | cash | Petty cash |
| 1050 | Checks Released, Not Cleared | contra_cash | Tracks check float (written but not posted at bank) |
| 1100 | Accounts Receivable - Home Sales | receivable | AR from home closings |
| 1110 | Retainage Receivable | receivable | Retainage held back |
| 1120 | Due from Lender - Unfunded Draws | receivable | Submitted but unfunded draws (not currently used -- draws have no JE on submit) |
| 1200 | Land Inventory | inventory | Land/lot cost basis |
| 1210 | Construction Work in Progress (WIP) | inventory | Accumulated construction costs on active projects |
| 1220 | Capitalized Interest - Construction Loans | wip | Interest capitalized to WIP during active construction |
| 1230 | CIP - Land Improvements | fixed_asset | Site clearing, grading, fencing, dev interest |
| 1300 | Prepaid Expenses | prepaid | General prepaids |
| 1310 | Prepaid Insurance - Builders Risk | prepaid | Builder's risk insurance |
| 1400 | Vehicles & Equipment | fixed_asset | Company vehicles and equipment |
| 1410 | Accum Depr - Vehicles & Equipment | fixed_asset | Contra-asset for 1400 |
| 1420 | Office Equipment & Furniture | fixed_asset | Office FF&E |
| 1430 | Accum Depr - Office Equipment | fixed_asset | Contra-asset for 1420 |

### Liabilities (2XXX)

| Account | Name | Subtype | Purpose |
|---------|------|---------|---------|
| 2000 | Accounts Payable - Trade | payable | All vendor payables |
| 2010 | Retainage Payable | payable | Retainage owed to subs |
| 2100 | Dev Loan Payable - FNBBA #5017 | loan | Prairie Sky development loan |
| 2110 | Accrued Interest - Construction Loans | accrued | Accrued interest on all construction loans |
| 2200 | Customer Deposits / Earnest Money | deposit | Buyer deposits |
| 2201 | Constr Loan - #125142 (Lot 1) | loan | 7331 S. Douglas |
| 2202 | Constr Loan - #125144 (Lot 2) | loan | 7281 S. Douglas |
| 2203 | Constr Loan - #125149 (Lot 22) | loan | 7231 S. Douglas |
| 2204 | Constr Loan - #125150 (Lot 23) | loan | 7181 S. Douglas |
| 2205 | Constr Loan - #125151 (Lot 24) | loan | 7131 S. Douglas |
| 2206 | Constr Loan - #125152 (Lot 25) | loan | 7081 S. Douglas |
| 2300 | Accrued Expenses | accrued | General accruals |
| 2400 | Sales Tax Payable | tax | Sales tax |
| 2500 | Payroll Liabilities | payroll | Payroll withholdings |

### Equity (3XXX)

| Account | Name | Subtype | Purpose |
|---------|------|---------|---------|
| 3010 | Member Capital - Sikes | capital | Jon Sikes capital contributions |
| 3020 | Member Capital - VeVea | capital | Marty VeVea capital contributions |
| 3100 | Retained Earnings | retained_earnings | Accumulated net income |
| 3110 | Owner's Distributions - Sikes | distributions | Jon Sikes draws/returns |
| 3120 | Owner's Distributions - VeVea | distributions | Marty VeVea draws/returns |

### Revenue (4XXX)

| Account | Name | Subtype |
|---------|------|---------|
| 4000 | Home Sales Revenue | sales |
| 4100 | Lot Sales Revenue | sales |
| 4200 | Upgrade & Options Revenue | sales |
| 4300 | Other Revenue | other |

### Cost of Goods Sold (5XXX)

All project-level construction costs. These accounts are linked from cost codes via `cost_codes.gl_account_id`. See `.claude/memory/cost_codes.md` for the full mapping. Range: 5000-5970.

### Operating Expenses / G&A (6XXX)

All company-level expenses (cost codes 103-120). These are never project-assigned. Range: 6000-6900.

---

## 3. Key Schema Linkages

These existing database relationships enable automatic journal entry generation:

### Cost Code -> GL Account
- Table: `cost_codes`
- Column: `gl_account_id` (FK to `chart_of_accounts.id`)
- Column: `wip_treatment` (`capitalize`, `expense`, or `land`)
- Usage: When an invoice is approved, look up the cost code's `gl_account_id` to determine the debit account. The `wip_treatment` flag tells you whether to capitalize to WIP (1210), expense directly (6XXX), or post to land inventory (1200).

### Loan -> COA Liability Account
- Table: `loans`
- Column: `coa_account_id` (FK to `chart_of_accounts.id`)
- Usage: When a draw is funded, look up the loan's `coa_account_id` to get the specific 22XX liability account to credit.

### Loan Draw -> Loan -> Project
- Table: `loan_draws`
- Column: `loan_id` (FK to `loans.id`)
- Chain: `loan_draws.loan_id` -> `loans.coa_account_id` -> `chart_of_accounts` (the 22XX account)
- Chain: `loans.project_id` -> `projects.id`

### Invoice -> Cost Code -> GL Account
- Table: `invoices`
- Column: `cost_code_id` (FK to `cost_codes.id`)
- Chain: `invoices.cost_code_id` -> `cost_codes.gl_account_id` -> `chart_of_accounts`

### Invoice -> Project -> Loan
- Chain: `invoices.project_id` -> `projects.id`, then `loans.project_id` to find the loan

### GL Entry Grouping
- Table: `gl_entries`
- Column: `transaction_group_id` (uuid) -- groups multi-line entries (e.g., HUD-1)
- Column: `cost_code_id` (FK to `cost_codes.id`) -- for project cost drill-down
- Column: `loan_id` (FK to `loans.id`) -- for loan-level reporting
- Column: `source_id` (uuid) -- FK to the originating record (invoice, draw, etc.)

---

## 4. Invoice Lifecycle and Statuses

### Invoice Types
- `standard` -- Normal vendor invoice (positive amount)
- `credit_memo` -- Vendor credit/refund (links to parent via `parent_invoice_id`)

### Invoice Statuses

```
pending_review --> approved --> released --> cleared
                      |             |
                      |             +--> disputed (partial/full)
                      |
                      +--> disputed (before release)
                      |
                      +--> void

Any status --> void (cancellation)
```

| Status | Meaning | JE Triggered? |
|--------|---------|---------------|
| pending_review | AI-processed or manually entered, awaiting human review | No |
| approved | Reviewed and approved for payment | Yes -- invoice_accrual |
| released | Check written and sent, not yet cleared at bank | Yes -- check_released |
| cleared | Check has posted/cleared at the bank | Yes -- check_cleared |
| disputed | Full or partial dispute in progress | No (holds the invoice) |
| void | Cancelled or voided | Reversal JE if previously approved |

### Payment Types
- `check` -- Standard check payment (most common)
- `ach` -- Electronic bank transfer
- `wire` -- Wire transfer
- `credit_card` -- Credit card payment
- `owner_contribution` -- Owner pays vendor directly (equity, not cash)
- `credit_applied` -- Paid via vendor credit memo

### Check Tracking Fields
- `check_number` -- The check number written
- `released_date` -- Date check was written/mailed
- `cleared_date` -- Date check posted at the bank

### Dispute Fields
- `disputed_amount` -- Dollar amount in dispute (can be partial)
- `dispute_reason` -- Explanation of the dispute
- `dispute_resolved_date` -- Date dispute was resolved

---

## 5. Workflow A: Standard Invoice (Bank-Paid via Draw)

This is the primary flow (~90% of invoices).

### Step 1: Invoice Created
- Invoice enters system with `status: 'pending_review'`
- Source: manual entry, email ingestion, or AI extraction
- No journal entry yet

### Step 2: Invoice Approved
- User reviews and approves the invoice
- Status changes to `approved`
- User prompted: "Add to pending draw request?" (sets `pending_draw = true`)
- **AUTO JE (source_type: 'invoice_accrual'):**

```
DR  [cost_code.gl_account_id]    $amount    (WIP, expense, or land per wip_treatment)
CR  2000 Accounts Payable        $amount
```

- `gl_entries.project_id` = invoice's project_id
- `gl_entries.cost_code_id` = invoice's cost_code_id
- `gl_entries.source_id` = invoice id

### Step 3: Draw Submitted
- Approved invoices with `pending_draw = true` are grouped into a draw request
- Draw status: `draft` -> `submitted`
- **No journal entry.** Status change only.

### Step 4: Draw Funded
- Bank funds the draw
- Draw status changes to `funded`
- Invoices in draw are locked (cannot be re-drawn)
- **AUTO JE (source_type: 'draw_funded'):**

```
DR  1000 Cash - Operating         $total_draw_amount
CR  [loan.coa_account_id]         $total_draw_amount    (e.g., 2201 Constr Loan)
```

- `gl_entries.loan_id` = the loan's id
- `gl_entries.source_id` = draw id
- One JE per draw (total amount), not per invoice
- Updates `loans.current_balance` by adding draw amount

### Step 5: Check Released
- User writes check and marks invoice as `released`
- Sets `check_number`, `released_date`, `payment_type: 'check'`
- **AUTO JE (source_type: 'check_released'):**

```
DR  2000 Accounts Payable                $amount
CR  1050 Checks Released, Not Cleared    $amount
```

- AP is NOT cleared yet (stays as a book entry until check clears)
- Wait -- correction: AP IS cleared at this step. The liability moves from AP to the contra-cash float.
- `gl_entries.source_id` = invoice id

### Step 6: Check Cleared
- Check posts at the bank, user marks invoice as `cleared`
- Sets `cleared_date`, `payment_date`
- **AUTO JE (source_type: 'check_cleared'):**

```
DR  1050 Checks Released, Not Cleared    $amount
CR  1000 Cash - Operating                $amount
```

- Contra-cash zeroes out, actual cash decreases
- Books now match the bank
- `gl_entries.source_id` = invoice id

---

## 6. Workflow B: Owner Direct Payment

When an owner pays a vendor directly (no cash through business account).

### Steps 1-2: Same as Workflow A
- Invoice created with `pending_review`, then approved
- Approval JE is identical (DR cost account, CR AP)

### Step 3: Owner Pays Vendor
- Status changes to `cleared` (skips `released` -- no check involved)
- Sets `payment_type: 'owner_contribution'`
- Sets `owner_equity_account_id` to either 3010 (Sikes) or 3020 (VeVea)
- **User is always prompted to select which member.**
- **AUTO JE (source_type: 'owner_contribution'):**

```
DR  2000 Accounts Payable              $amount
CR  3010 or 3020 Member Capital        $amount    (based on owner_equity_account_id)
```

- AP is cleared, owner's equity increases
- No cash movement in the business
- `gl_entries.source_id` = invoice id

---

## 7. Workflow C: Credit Memo

When a vendor issues a credit against a previous invoice.

### Step 1: Credit Memo Created
- New invoice record with `type: 'credit_memo'`
- `parent_invoice_id` links to the original invoice
- Amount is the credit amount (stored as positive; the JE logic reverses it)
- Status: `pending_review`

### Step 2: Credit Memo Approved
- Status changes to `approved`
- **AUTO JE (source_type: 'credit_memo'):**

```
DR  2000 Accounts Payable              $credit_amount
CR  [cost_code.gl_account_id]          $credit_amount    (reverses original cost)
```

- This is the reverse of the original invoice accrual
- Reduces both AP and WIP/expense
- `gl_entries.project_id` = same project as original invoice
- `gl_entries.cost_code_id` = same cost code as original invoice
- `gl_entries.source_id` = credit memo invoice id

### Step 3: Application
- Credit can be applied against future invoices to the same vendor
- Or it can reduce the amount of the next check to that vendor
- Set `payment_type: 'credit_applied'` and status to `cleared`
- No additional JE needed -- the AP reduction already happened in Step 2

---

## 8. Workflow D: Invoice Dispute

When you dispute all or part of an invoice after it has been entered.

### Scenario A: Dispute Before Approval
- Invoice is still `pending_review`
- Simply change status to `disputed` and fill in `disputed_amount` and `dispute_reason`
- No JE has been posted, so nothing to reverse
- Resolution: either approve (proceed to Workflow A) or void

### Scenario B: Dispute After Approval (partial)
- Invoice was approved and the accrual JE has been posted
- You dispute a portion (e.g., $2,000 of a $10,000 invoice)
- Change status to `disputed`, set `disputed_amount: 2000`, `dispute_reason`
- The full AP accrual ($10,000) stays on the books
- The undisputed portion ($8,000) can still flow through draw/release/clear
- When releasing, only release $8,000 (the non-disputed portion)

### Dispute Resolution Options:
1. **Vendor agrees to reduce** -- Vendor issues credit memo (Workflow C) for the disputed amount. Set `dispute_resolved_date`. Change invoice back to `approved` for the remaining amount.
2. **You agree to pay full amount** -- Set `dispute_resolved_date`, change back to `approved`, proceed normally.
3. **Void the entire invoice** -- Change to `void`. Post reversal JE:

```
DR  2000 Accounts Payable              $original_amount
CR  [cost_code.gl_account_id]          $original_amount
```

---

## 9. Project Opening Entry (HUD-1 / Settlement Statement)

When a project closes on land/lot purchase, record the settlement statement as a multi-line journal entry.

### Process
- Source type: `project_opening`
- All lines share the same `transaction_group_id`
- Each line carries `project_id`
- Entry date = closing date

### Typical Entry (Home Construction)

```
DR  1200 Land Inventory                  $lot_cost          (land basis)
DR  5020 Closing & Financing Costs       $origination_fee   (loan origination, title, etc.)
DR  5080 Property Taxes & Insurance      $prorated_taxes    (prorated property taxes)
DR  1300 Prepaid Expenses                $prepaid_items     (prepaid insurance, etc.)
CR  22XX Constr Loan                     $loan_proceeds     (from loan.coa_account_id)
CR  1000 Cash - Operating                $cash_to_close     (any cash brought to closing)
```

### Typical Entry (Land Development)

```
DR  1200 Land Inventory                  $purchase_price
DR  5020 Closing & Financing Costs       $closing_costs
DR  5080 Property Taxes & Insurance      $prorated_taxes
CR  2100 Dev Loan Payable                $loan_proceeds     (from loan.coa_account_id)
CR  1000 Cash - Operating                $cash_to_close
```

### Rules
- Total debits must equal total credits
- The loan amount credited should match the initial `loans.loan_amount`
- Update `loans.current_balance` to reflect the initial draw
- This entry establishes the project's starting cost basis

---

## 10. GL Entry Rules

### gl_entries Table Structure

| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| id | uuid | auto | PK |
| project_id | uuid | nullable | FK to projects (null for G&A) |
| entry_date | date | yes | Date of the transaction |
| description | text | yes | Human-readable description |
| debit_account | text | yes | COA account_number being debited |
| credit_account | text | yes | COA account_number being credited |
| amount | numeric | yes | Dollar amount (always positive) |
| source_type | text | yes | See valid values below |
| source_id | uuid | nullable | FK to originating record |
| transaction_group_id | uuid | auto | Groups multi-line entries |
| cost_code_id | uuid | nullable | FK to cost_codes for reporting |
| loan_id | uuid | nullable | FK to loans for loan reporting |

### Valid source_type Values

| Value | Trigger Event |
|-------|---------------|
| manual | Hand-entered journal entry |
| project_opening | HUD-1 / settlement statement at project start |
| invoice_accrual | Invoice approved (DR cost, CR AP) |
| draw_funded | Bank funds draw (DR Cash, CR Loan) |
| check_released | Check written (DR AP, CR 1050) |
| check_cleared | Check posts at bank (DR 1050, CR Cash) |
| owner_contribution | Owner pays vendor directly (DR AP, CR Member Capital) |
| credit_memo | Credit memo approved (DR AP, CR cost -- reversal) |
| invoice_payment | Legacy -- kept for backward compatibility |
| loan_draw | Legacy -- kept for backward compatibility |

### Balancing Rule
- Every transaction must balance: sum of debits = sum of credits
- For multi-line entries, all rows sharing the same `transaction_group_id` must balance as a group
- Single-line entries have one debit and one credit of equal amount

### Description Conventions
- invoice_accrual: "Invoice accrual: {Vendor Name} - {Cost Code Name} - {Project Name}"
- check_released: "Check #{check_number} released: {Vendor Name} - {Invoice Number}"
- check_cleared: "Check #{check_number} cleared: {Vendor Name} - {Invoice Number}"
- draw_funded: "Draw #{draw_number} funded: {Loan Number} - {Project Name}"
- owner_contribution: "Owner contribution ({Member Name}): {Vendor Name} - {Invoice Number}"
- credit_memo: "Credit memo: {Vendor Name} - {Cost Code Name} - {Project Name}"
- project_opening: "Project opening: {Project Name} - {line item description}"

---

## 11. Draw Request Process

### Creating a Draw
1. Pull all invoices where `pending_draw = true` AND `status = 'approved'` AND invoice is not in any funded draw
2. Group by project (and therefore by loan, since each project has one construction loan)
3. Create `loan_draws` record with `status: 'draft'`, linked to the loan via `loan_id`
4. Create `draw_invoices` join records linking each invoice to the draw

### Submitting a Draw
- Change draw status from `draft` to `submitted`
- No journal entry
- This is the batch sent to the bank weekly

### Funding a Draw
- Change draw status from `submitted` to `funded`
- **AUTO JE (source_type: 'draw_funded'):**

```
DR  1000 Cash - Operating             $draw_total
CR  [loan.coa_account_id]             $draw_total
```

- Mark all invoices in the draw as locked from future draws (they are already linked via `draw_invoices`)
- Update `loans.current_balance += draw_total`

### Draw Cannot Include:
- Invoices with status `pending_review`, `disputed`, or `void`
- Invoices already in a funded draw
- G&A invoices (no project/loan)

---

## 12. Balance Verification Checks

Use these queries to verify the books are in balance at any time.

### Total GL Balance (debits must equal credits)
```sql
SELECT
  SUM(amount) FILTER (WHERE debit_account IS NOT NULL) as total_debits,
  SUM(amount) FILTER (WHERE credit_account IS NOT NULL) as total_credits
FROM gl_entries;
-- These should be equal
```

### AP Balance Should Match
```sql
-- AP from GL (credits to 2000 minus debits to 2000)
SELECT
  SUM(CASE WHEN credit_account = '2000' THEN amount ELSE 0 END) -
  SUM(CASE WHEN debit_account = '2000' THEN amount ELSE 0 END) as gl_ap_balance
FROM gl_entries;

-- Should equal: sum of approved (not yet released/cleared) invoices
SELECT SUM(amount) FROM invoices WHERE status = 'approved' AND type = 'standard';
```

### Check Float Balance
```sql
-- 1050 balance from GL
SELECT
  SUM(CASE WHEN credit_account = '1050' THEN amount ELSE 0 END) -
  SUM(CASE WHEN debit_account = '1050' THEN amount ELSE 0 END) as check_float
FROM gl_entries;

-- Should equal: sum of released (not yet cleared) invoices
SELECT SUM(amount) FROM invoices WHERE status = 'released';
```

### Loan Balance Should Match
```sql
-- Per loan from GL
SELECT credit_account,
  SUM(CASE WHEN credit_account LIKE '2%' THEN amount ELSE 0 END) -
  SUM(CASE WHEN debit_account LIKE '2%' THEN amount ELSE 0 END) as loan_balance
FROM gl_entries
WHERE credit_account IN ('2201','2202','2203','2204','2205','2206')
   OR debit_account IN ('2201','2202','2203','2204','2205','2206')
GROUP BY credit_account;

-- Should match loans.current_balance for each loan
```

### Project WIP Should Match
```sql
-- WIP from GL per project
SELECT project_id,
  SUM(CASE WHEN debit_account = '1210' THEN amount ELSE 0 END) -
  SUM(CASE WHEN credit_account = '1210' THEN amount ELSE 0 END) as wip_balance
FROM gl_entries
WHERE project_id IS NOT NULL
GROUP BY project_id;

-- Should equal: sum of approved/released/cleared standard invoices minus credit memos per project
-- (for cost codes with wip_treatment = 'capitalize')
```

---

## 13. Reporting Implications

### Project-Level Reports
- Job Cost Report: Query `gl_entries` by `project_id` and `cost_code_id`, grouping by cost code
- Budget Variance: Compare `project_cost_codes.budget_amount` to actual GL entries per cost code
- WIP Report: Sum of all capitalizable costs per project from GL

### Company-Level Financial Reports
- Income Statement: Revenue (4XXX) minus COGS (5XXX) minus Expenses (6XXX) from GL
- Balance Sheet: Assets (1XXX) minus Liabilities (2XXX) minus Equity (3XXX) from GL
- Cash Flow: Derived from GL entries to/from cash accounts (1000, 1010, 1020)
- AP Aging: Invoices with status `approved` grouped by due_date buckets

### Drill-Down
- All financial reports support drill-down to individual `gl_entries`
- Each GL entry links back to its source via `source_id` and `source_type`
- Multi-line entries are grouped by `transaction_group_id`

---

## Revision History

- 2026-04-04: Initial SOP created. Covers full invoice lifecycle, draw process, owner contributions, credit memos, disputes, and project opening entries.
