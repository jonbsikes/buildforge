# BuildForge — Code Review & Overhaul Plan

_Audit date: 2026-04-22. Scope: whole-codebase first pass (280 files, ~54k LoC, 27 migrations)._

> **How to use this doc:** Each step under "Order of Operations" is self-contained. Open a fresh conversation and say "read `OVERHAUL_PLAN.md` and tackle Step N" — the step should have enough context to act without this conversation's history.
>
> **Chunks NOT yet reviewed (queue for a second-pass audit):** `src/app/actions/banking.ts` (526 LoC), `payments.ts` (994 LoC), `bank-transactions.ts` (561 LoC), `projects.ts` (422 LoC), `create-project.ts` (264 LoC), `stages.ts` (179 LoC), individual report pages under `src/app/(app)/reports/**`, Supabase edge functions under `supabase/functions/`.

---

## Executive Summary

Overall health: **yellow**. Product is functionally ambitious and the core domain logic (double-entry GL, draw lifecycle, invoice state machine) shows real thought. Three structural problems compound risk:

1. **Migrations folder has drifted from the live database.** Tables and columns the app depends on every day (`journal_entries`, `chart_of_accounts`, `wip_ap_posted`, `direct_cash_payment`) exist in Supabase and in `database.ts` but have no migration. Fresh-environment provisioning is broken. Filename collisions (six pairs at 002/004/005/006/007/010) make ordering undefined.
2. **Server-action layer is half-migrated.** CLAUDE.md declares route-level `actions.ts` deleted; eight still exist, some duplicates, some holding unique logic.
3. **Two core actions files are god-modules with correctness and atomicity issues.** `invoices.ts` (1456 LoC) and `draws.ts` (1484 LoC) have a real JE-balance bug in `markVendorPaymentPaid` with discounts, `disputeInvoice` bypassing the state machine, and `fundDraw` marking status funded before JEs post.

Plus: open-redirect in `/auth/callback`, public un-auth'd `/api/reports/[slug]`, no prompt caching on Claude extraction routes.

---

## Findings Table

### 🔴 Critical

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| C1 | `supabase/migrations/` | Six filename collisions (002/004/005/006/007/010). Supabase CLI ordering undefined. | Renumber to monotonic sequence; consolidate if live DB is the source of truth. |
| C2 | Migrations vs `src/types/database.ts` | `journal_entries`, `journal_entry_lines`, `chart_of_accounts`, `selections`, `notifications` tables have no migration. `invoices.wip_ap_posted`, `invoices.direct_cash_payment`, `loans.loan_type/credit_limit/coa_account_id` columns same. Only `018_vendor_auto_draft.sql:11` mentions `direct_cash_payment` — in a comment. | Generate baseline from live DB (`supabase db diff --schema public`) and commit. Fresh-env provisioning is broken until done. |
| C3 | `src/app/actions/draws.ts:1144–1158` (`markVendorPaymentPaid`) | JE debit uses `vp.amount` but credit splits `netAmount` + per-WIP discount credits. Works out by construction but intent is unclear and debit side diverges from CLAUDE.md spec (DR AP / CR 2050). | Debit net AP, credit net 2050. Book discount as a separate reversing WIP/AP JE with its own reference for clean audit trail. |
| C4 | `src/app/actions/draws.ts:513–970` (`fundDraw`) | Status claimed `funded` *before* JEs post. If step 2 or 3 fails, draw is funded with partial/no GL — unrecoverable without DB surgery. `loans.current_balance` update loop (885–902) also non-atomic. | Post all three JEs first, batch-update `current_balance`, flip status last. Better: wrap in a Postgres function invoked from the action. |
| C5 | `src/app/actions/invoices.ts:971–989` (`disputeInvoice`) | Direct `UPDATE invoices SET status='disputed'` bypasses `applyStatusTransition`. No `wip_ap_posted` check, no reversal of prior WIP/AP, no block on disputing a released invoice. | Route through `applyStatusTransition(id, 'disputed')`. Define rules for disputing at each prior state. |
| C6 | `src/app/actions/invoices.ts` (~347, 448, 659, 1107, 1232, 1400, 1432) | `journal_entry_lines` inserts have no error check. If lines fail after header insert, ledger is permanently unbalanced. | Capture `{ error }` on every line insert; roll back header on failure. Extract a `postJournalEntry(header, lines)` helper that enforces this. |
| C7 | `src/app/actions/invoice-actions-extra.ts:57–142` (`payInvoiceAutoDraft`) | Second, ungoverned path to clear an invoice (DR AP / CR Cash) not going through `advanceInvoiceStatus`. Not in CLAUDE.md triggers. | Delete and let `approveInvoice` with `direct_cash_payment=true` own this path, OR integrate into state machine and document. |
| C8 | `src/app/auth/callback/route.ts:7–13` | `next` query param interpolated into redirect with no validation. `?next=//attacker.com` is an open redirect. | Accept only when `next.startsWith('/') && !next.startsWith('//')`; otherwise default to `/dashboard`. |
| C9 | `src/app/api/reports/[slug]/route.ts:14–68` | No auth check. Any unauthenticated request can fetch any report PDF, including financial statements. | Add `supabase.auth.getUser()` gate at the top; 401 on miss. Scope report queries to user's owned projects. |

### 🟡 Important

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| I1 | `src/app/(app)/**/actions.ts` (8 files) | Contradicts CLAUDE.md claim route-level actions were deleted. `contacts/actions.ts`, `vendors/actions.ts`, `projects/actions.ts`, `notifications/actions.ts`, `settings/actions.ts` are thin duplicates. `field-logs/actions.ts` (200 LoC photo upload) and `documents/actions.ts` hold unique logic. `projects/[id]/actions.ts` (357 LoC) is mixed. | Delete pure duplicates. Migrate unique logic into `src/app/actions/field-logs.ts` and `src/app/actions/documents.ts`. Update CLAUDE.md. |
| I2 | `src/app/actions/invoices.ts` | ~5 copies of "group lines by WIP account + look up GL account IDs + build JE line array" pattern (lines 257–270, 599–610, 1047–1058, 1172–1183, 1307–1320). | Extract `groupLineItemsByWip()` and `getAccountIdMap(numbers)` helpers. |
| I3 | `src/app/actions/draws.ts`, `banking.ts`, `payments.ts` | Same GL-account lookup reinvented ~15 times. `payments.ts` has a `getGLAccounts` helper not exported. | Extract to `src/app/actions/_gl.ts` (or `src/lib/gl/accounts.ts`) and use everywhere. |
| I4 | `src/app/actions/invoices.ts:229` vs `:388` (`approveInvoice`) | Check-then-act race: status read at 229, update at 388. Double-click approval posts duplicate WIP/AP. | Do status check in the `UPDATE … WHERE status = 'pending_review'` predicate; branch on affected-row count. |
| I5 | `supabase/migrations/004_draws_schema.sql:7,12,20`; `011_vendor_payments.sql:40,45` | `loan_draws`, `draw_invoices`, `gl_entries`, `vendor_payments` use `auth.role() = 'authenticated'` RLS — any logged-in user sees everything. | Scope via project ownership (`EXISTS (SELECT 1 FROM projects WHERE projects.user_id = auth.uid() …)`). |
| I6 | `src/app/api/invoices/extract/route.ts`, `src/app/api/vendors/extract/route.ts` | No prompt caching; ~460-line system prompt re-sent every call. Duplicate extraction scaffolding. | Add `cache_control: { type: 'ephemeral' }` on system prompt block. Extract shared `extractWithClaude(pdf, systemPrompt, schema)` helper. |
| I7 | `src/app/actions/invoices.ts:1276–1298` (`advanceInvoiceStatus`) | Status updated before `invoice.amount <= 0` and not-found checks return `{}` success — status committed with no matching JE. | Fetch → validate → update in that order; return error on validation fail. |
| I8 | `src/app/(app)/contacts/[id]/page.tsx`, `contracts/[id]/page.tsx` | Marked `'use client'` and fetch inside `useEffect` with no error handling — infinite "Loading…" on failure. | Convert to Server Components; fetch in async body; pass props to thin Client child. |
| I9 | Multiple "new" forms (`NewContactForm.tsx:55–76`, `NewVendorForm.tsx:31–59`, `NewProjectForm.tsx:17–65`) | Use `useState` + direct `supabase.from().insert()` in client. Bypasses server action layer → no revalidation, DB shape leaks to client. | Standardize on Server Action + `useTransition`. |
| I10 | `src/app/actions/draws.ts:774–881` | WIP/AP loop in `fundDraw` only runs when `wip_ap_posted=false`, which can't happen in normal flow. Either spec is wrong or loop is dead. | Confirm intent; remove the loop or document the triggering scenario with a test. |
| I11 | `markVendorPaymentPaid` vs `createPayment` (payments.ts) | Two paths can mark vendor_payment paid and auto-close a draw. Intentional recovery, but undocumented race surface. | Add DB-level idempotency constraint on the paid transition. Note duplication in CLAUDE.md. |
| I12 | `src/app/api/draws/[id]/pdf/route.ts`, `remittances-pdf/route.ts` | Entire merged PDF buffered in memory; no project-ownership RLS at route level. | Add ownership check; cap vendors/invoices per PDF or paginate. |
| I13 | `src/app/(app)/field-logs/**`, `DocumentsTab.tsx`, `JournalEntriesClient.tsx` | `alert()`-based error UX mixed with inline error states elsewhere. | Pick one: small dependency-free toast used everywhere. |

### 🟢 Minor

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| M1 | `src/lib/supabase/middleware.ts:8` | `createServerClient<any>` loses type safety. | Use `createServerClient<Database>` once types stabilize. |
| M2 | `ui-redesign-prototype.jsx` (72KB, repo root) | Unreferenced artifact. | Delete or move under `docs/`. |
| M3 | Input focus ring colors | `focus:ring-amber-400/500`, `focus:ring-blue-500`, `focus:ring-[#4272EF]` mixed. CLAUDE.md mandates `#4272EF`. | Shared `inputCls` constant. |
| M4 | `how --oneline 0bee0929...` at repo root | Accidental file from a mistyped `git show`. | Delete. |
| M5 | 3 different "delete confirmation" UIs (modal, inline ternary, native `confirm()`) | Inconsistent UX. | One `<ConfirmButton />` primitive. |
| M6 | `src/proxy.ts` naming | Using Next.js 15.3+ `proxy.ts` convention (not `middleware.ts`). | Fine if deliberate — add a one-line comment so contributors don't "correct" it. |
| M7 | `disputeInvoice`, `voidInvoice`, `voidAfterDraw` | Three void/dispute entry points with subtly different semantics. | Collapse into `applyStatusTransition`-driven path. |

---

## Structural Concerns

1. **Migrations are not the source of truth.** `.claude/memory/` spec and `database.ts` agree; migrations folder does not. Until reconciled, schema advice is speculative.
2. **Two competing server-action layers** (`src/app/actions/*` vs `src/app/(app)/**/actions.ts`). Pick one, delete the other.
3. **God-module problem in `invoices.ts` + `draws.ts`** (~3000 LoC together). GL helpers copy-pasted 5+ times. A `postJournalEntry(header, lines, accountMap)` primitive would shrink both files by hundreds of lines and eliminate a class of "forgot to check the lines insert" bugs.
4. **No transactional guarantees** across mutation+GL pairs. Every lifecycle event is 2–4 sequential writes from a server action. Midway failures leave the ledger in a half-state. Postgres functions (or `rpc()` calls) would give real atomicity.
5. **Boundary validation is thin.** `/api/reports/[slug]` accepts any query params; `/auth/callback` trusts `next`; Claude extraction routes trust FormData shape. No zod or equivalent at any system boundary.

---

## Order of Operations

**Work these in order — each step unblocks the next.** Each step below is written to be actionable with only this file + the current codebase as context (no prior conversation needed).

### Step 1 — Reconcile migrations with the live database ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-1-migrations` (commit `45cdada`). Worktree at `C:\Users\jonsi\Projects\buildforge-migrations`. Not yet merged to `main`.

**What actually happened (deviated from original plan — read before Step 2):**

- **Approach: full replace, not delta.** The 27 folder migrations had drifted so badly from the live DB (78 applied migrations, 7 critical tables missing from folder entirely) that a "delta" baseline was ill-defined. Instead: generated ONE canonical baseline from live DB introspection and archived the old files.
- **Old files → `supabase/migrations/_archive/`** via `git mv` (history preserved). They are NOT applied by fresh-env provisioning anymore — treat them as historical reference only.
- **New baseline:** `supabase/migrations/001_baseline_2026-04-22.sql` (1,067 lines). Generated via `pg_get_functiondef` / `pg_get_triggerdef` + `information_schema` / `pg_constraint` / `pg_indexes` / `pg_policies` introspection through the Supabase MCP. Contents: 2 extensions, 5 enums, 35 tables with columns + PKs + UNIQUEs + CHECKs, 76 FKs (deferred to a separate section to dodge ordering issues), 17 non-PK indexes, 4 functions, 15 triggers, RLS enabled on all 35 tables, 47 policies.
- **Validation done:** regenerated `src/types/database.ts` from live DB and diffed against the committed file → empty diff (after CRLF normalisation). Every required item verified present: `wip_ap_posted`, `direct_cash_payment` on invoices; `loan_type`/`credit_limit`/`current_balance`/`coa_account_id` on loans; all 7 "missing" tables.
- **Validation NOT done:** couldn't run `supabase db reset` (no local CLI/Docker) and couldn't use Supabase branching to spin up an empty test DB (branching requires Pro plan — org is on free). The baseline has not been applied against a truly empty Postgres yet. Risk is narrow (see invariants below) but real.

**Invariants to know going forward:**

- **`001_baseline_2026-04-22.sql` is the source of truth for schema.** Steps 3, 6, 8 add NEW migrations after it — don't edit the baseline to squeeze in changes.
- **RLS policies in the baseline are permissive** (`auth.role() = 'authenticated'` on most tables). That's intentional — it mirrors live. **Step 6 will tighten them** via a new migration. Do not pre-tighten during Steps 2–5.
- **FKs that reference `auth.users`** are emitted as-is in the baseline — they resolve on Supabase (where the `auth` schema exists). If anyone ever tries to apply the baseline against a plain Postgres container for testing, they'll need to stub `auth.users` + `auth.role()` + `auth.uid()` first.
- **`gl_entries` table is in the baseline** because it's in the live DB. It's still legacy per CLAUDE.md — don't write new entries to it. Don't drop it until CLAUDE.md is updated and all reads have been verified migrated.
- **When you finally set up local Supabase + Docker** (for Steps 2+ verification work), the first thing to do is apply this baseline and regenerate types as a sanity check. If `database.ts` diffs, investigate before proceeding — a schema drift there would mean the baseline is wrong.
- **Old migration files are in `supabase/migrations/_archive/`.** They are NOT run by `supabase db reset`. Do not move them back. If you need to look up how something got added historically, grep the archive; the historical context is still there.

**References:** Findings C1, C2 (both closed by this step).

---

### Step 2 — Extract shared GL helpers

**Goal:** One place for "post a balanced journal entry" and "look up account IDs by number." Prep work for Steps 3–5.

**What to do:**
- Create `src/lib/gl/accounts.ts` with: `getAccountIdMap(supabase, accountNumbers: string[]): Promise<Map<string, string>>`.
- Create `src/lib/gl/postEntry.ts` with `postJournalEntry(supabase, header, lines): Promise<{ id: string } | { error: string }>` — inserts header, inserts lines, rolls back header if lines fail, asserts `sum(debits) === sum(credits)` before posting.
- Replace all ~15 inline `chart_of_accounts` lookups in `invoices.ts`, `draws.ts`, `banking.ts`, `payments.ts`, `journal-entries.ts` with the new helpers.
- Replace all `journal_entries` + `journal_entry_lines` insert pairs with `postJournalEntry` calls.

**Acceptance:** `grep "chart_of_accounts" src/app/actions` returns only calls to the helper. `grep "journal_entry_lines" src/app/actions` returns only calls to `postJournalEntry`.

**References:** Findings C6, I2, I3.

---

### Step 3 — Fix `fundDraw` atomicity + `markVendorPaymentPaid` discount math ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged.

**What shipped:**
- `fundDraw` (`src/app/actions/draws.ts:505`): removed the claim-first status flip. All JEs (Cash/1120, 2060/Loan Payable, WIP/AP), `loans.current_balance` updates, invoice locking (`pending_draw=false`), and `vendor_payments` creation now run while status is still `submitted`. The status flip to `funded` is the LAST step and is conditional (`.eq("status", "submitted")`) to catch concurrent funding. Added missing error-return guards on every prior-unchecked step (loan JE, WIP/AP JE, `wip_ap_posted` flag update, `loans.current_balance` update, invoice pending_draw lock). Intermediate failures now leave status as `submitted` so the user can retry (tradeoff: retry may post duplicate JEs — acceptable vs. stuck state).
- `markVendorPaymentPaid` (`src/app/actions/draws.ts:929`): primary JE is now clean `DR 2000 = netAmount / CR 2050 = netAmount` with reference `Check #XXXX` (or `VPmt-{id}` fallback). When a discount was taken, a separate JE posts with reference `DISC-VP-{id}`: `DR 2000 = totalDiscount / CR WIP/CIP (per project) = per-project shares`. Added guard to abort before any JE posts if a discount was requested but can't be allocated (prevents AP under-clearance).
- Balance assertion already lives in `postJournalEntry` helper from Step 2 — applies to every JE posted by this step's new code.

**Deferred:** RPC-based true atomicity (`supabase.rpc('fund_draw', …)`) — left as a follow-up. The narrow race window (concurrent fund attempts producing duplicate JEs) remains, but is bounded and detectable (the final conditional update returns an error telling the admin to review GL).

**References:** Findings C3, C4 (both closed).

---

### Step 4 — Route all invoice status changes through `applyStatusTransition` ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged.

**What shipped:**
- `approveInvoice` (`src/app/actions/invoices.ts:206`): early status-read/branch removed; both the direct-cash and AP-path `UPDATE` calls now gate on `.eq("status", "pending_review")` and `.select("id")`, branching on the affected-row count. Race between parallel double-clicks closed at the DB predicate — no TOCTOU gap.
- `advanceInvoiceStatus` (`src/app/actions/invoices.ts:1142`): reordered to fetch → validate → update. Returns `{ error }` (not silent success) on invoice-not-found or `amount <= 0`. UPDATE is gated on the required prior status (`approved` for `released`, `released` for `cleared`), preventing status drift from concurrent calls.
- `applyStatusTransition`: full transition matrix, replacing the ad-hoc `noLedgerFlip` set. New rules:
  - `pending_review → disputed`: flag-only (clears `pending_draw`)
  - `approved → disputed`: reverse WIP/AP via new `disputeApproved` helper
  - `released/cleared → disputed`: blocked with user-facing error
  - `pending_review/approved/disputed → void`: unified via new `voidFrom` helper, which posts the reversal iff `wip_ap_posted`; picks reference/description based on `isInFundedDraw` so the legacy `VOID-DRAWN-` reference is preserved for the ex-`voidAfterDraw` case
  - `released/cleared → void`: blocked
  - `disputed → approved`: re-post WIP/AP (via flip-to-pending_review then `approveInvoice`) when `wip_ap_posted = false`; flag-flip when already posted
  - `disputed → pending_review`: un-approve when `wip_ap_posted = true`; flag-flip otherwise
- `disputeInvoice`, `voidInvoice`, `voidAfterDraw` are now ~10-line thin wrappers that call `applyStatusTransition`. Preserved their exported signatures so `InvoiceDetailActions.tsx` and `InvoicesTable.tsx` (which import them) don't need to change.
- New private helper `postWipApReversal` (`src/app/actions/invoices.ts:545`): single implementation of DR 2000 AP / CR WIP-by-project. Replaces the ~4 copy-pasted variants that lived in `unapproveInvoice`, `voidInvoice`, and `voidAfterDraw`.

**Invariants after this step:**
- Every `status` write in `invoices.ts` is either (a) gated by `.eq("status", <expected>)` in the UPDATE, or (b) inside `applyStatusTransition` / one of its private helpers (`unapproveInvoice`, `disputeApproved`, `voidFrom`, `approveInvoice`, `advanceInvoiceStatus`).
- `grep "\.update.*status" src/app/actions/invoices.ts` shows 10 matches, all conforming.
- UI distinction between "Void Invoice" and "Void After Draw" on `DisputedActions` in `InvoiceDetailActions.tsx:41` is now cosmetic — both resolve to the same backend transition. Future UI simplification is out of scope for Step 4.
- Type check: `npx tsc --noEmit` clean (EXIT=0).

**Deferred / not done:**
- Subtle pre-existing bug in `updateInvoice`: replaces line items before calling `applyStatusTransition`, so a reversal after a line-item edit uses new line-item amounts. The original WIP/AP posting used old amounts — a reversal could be mis-distributed. Flagged for a future fix; Step 4 was scoped to the transition router.

**References:** Findings C5, I4, I7, M7 — all closed.

---

### Step 5 — Kill or adopt `payInvoiceAutoDraft` ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged.

**Decision: adopted, not killed.** `payInvoiceAutoDraft` is NOT redundant with `approveInvoice({ direct_cash_payment: true })`. They serve distinct journeys:
- `direct_cash_payment`: set AT approval time, bypasses AP entirely → single JE `DR WIP / CR Cash`, `pending_review → cleared`.
- `payInvoiceAutoDraft`: applied AFTER approval via the standard AP path, when the user later discovers the bank auto-drafted → single JE `DR AP / CR Cash`, `approved → cleared`. Without it, the only alternative is `approved → released → cleared` which bogusly touches Checks Outstanding (2050) for a payment where no check was ever written.

**What shipped:**
- Moved `payInvoiceAutoDraft` into `src/app/actions/invoices.ts` (alongside `approveInvoice` / `advanceInvoiceStatus`) and hardened it:
  - Gates the UPDATE on `.eq("status", "approved")` — closes the TOCTOU race.
  - Refuses if `wip_ap_posted = false` (corrupt state — no AP balance to clear).
  - Validates `invoiceAmount > 0` — returns error, no silent skip.
  - Propagates `postJournalEntry` errors and rolls back the status change if the JE fails.
  - Verifies GL accounts 2000 and 1000 exist before committing — rolls back otherwise.
  - Creates a Payment Register row (`payment_method = 'auto_draft'`, `funding_source = 'dda'`) to mirror the existing `direct_cash_payment` path for /banking/payments visibility.
- Deleted `src/app/actions/invoice-actions-extra.ts`. Moved the two batch helpers (`approveInvoicesBatch`, `setPendingDrawBatch`) into a new `src/app/actions/invoice-batch.ts` — both remain useful for bulk UI operations, so neither was deleted.
- Updated `InvoicesTable.tsx` imports accordingly.
- Documented `payInvoiceAutoDraft` in CLAUDE.md under "Automated Journal Entry Triggers" as the **Post-approval auto-draft path**.

**Invariants after this step:**
- `src/app/actions/invoice-actions-extra.ts` is gone.
- Every function in the codebase that writes `invoices.status` is either (a) one of the governed entry points in `invoices.ts` with a status-gated UPDATE, or (b) a private helper invoked by `applyStatusTransition`.
- `grep -r payInvoiceAutoDraft src` returns exactly one definition (in `invoices.ts`) and one call site (in `InvoicesTable.tsx`).
- `npx tsc --noEmit` clean.

**References:** Finding C7 (closed).

---

### Step 6 — Security hardening round ✅ DONE (migration not yet applied)

**Status:** Code changes completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged. **The RLS migration file is committed but has NOT been applied to the live Supabase DB** — see "Deferred" below.

**What shipped:**

- `src/app/auth/callback/route.ts` — `next` param is validated. Only accepts values that start with a single `/`. `?next=//evil.com`, `?next=https://evil.com`, and any non-slash prefix fall back to `/dashboard`.
- `src/app/api/reports/[slug]/route.ts` — `supabase.auth.getUser()` gate at the very top; returns 401 before any descriptor lookup or report rendering. Individual report modules already use the server supabase client so RLS filters their data by `auth.uid()` — no additional per-query scoping was needed in the route itself.
- `src/app/api/draws/[id]/pdf/route.ts` and `src/app/api/draws/[id]/remittances-pdf/route.ts` — `auth.getUser()` gate at route entry (401 on miss). Per-draw ownership is delegated to RLS: once migration 022 is live, the existing `.from("loan_draws").select(…).eq("id", id).single()` returns `null` for draws the user can't see, which the routes already translate to a 404.
- `supabase/migrations/022_tighten_rls_draw_tables.sql` — new migration. Adds `public.current_user_owns_any_project()` helper function (`LANGUAGE sql STABLE SECURITY DEFINER`, search_path pinned to `public`, execute granted to `authenticated`) so the check runs without re-applying RLS to the `projects` subquery. Drops the broad `auth.role() = 'authenticated'` policies on `loan_draws`, `draw_invoices`, `gl_entries`, `vendor_payments`, `vendor_payment_invoices`, `vendor_payment_adjustments` and replaces them with:
  - **Concrete `project_id` → ownership check** (`EXISTS (SELECT 1 FROM projects WHERE id = … AND user_id = auth.uid())`)
  - **Nullable `project_id` (multi-project draws / company-level GL) → `current_user_owns_any_project()`** — tightens from "any authenticated user" to "user is an owner of this deployment."
  - **Pivot/child tables** (`draw_invoices`, `vendor_payments`, `vendor_payment_invoices`, `vendor_payment_adjustments`) chain up to the parent draw's project check.

**Invariants after this step (once migration applied):**
- `grep "auth.role()" supabase/migrations/0*` returns matches only in archived / legacy files — no active policy depends on the blanket authenticated check for these six tables.
- A logged-out request to `/api/reports/[slug]`, `/api/draws/[id]/pdf`, or `/api/draws/[id]/remittances-pdf` returns 401. A logged-in user who owns no projects in this deployment still can't see any draws / vendor payments / gl_entries (returns empty under RLS).
- `?next=//evil.com` on `/auth/callback` redirects to `/dashboard`, not `//evil.com`.
- `npx tsc --noEmit` clean.

**Deferred / not done:**
- **Migration 022 is NOT applied to the live DB.** The SQL file is in the migrations folder but `supabase/migrations` has drifted from the live DB (per Step 1's notes — live DB has 78 migrations applied, folder has 21). Applying via the Supabase MCP `apply_migration` is straightforward but was held back: the three largest holes (open redirect, unauthenticated reports, unauthenticated draw PDFs) are closed by the code changes alone, and the RLS tightening is defense-in-depth for a currently-single-user app. Recommendation: apply migration 022 alongside the eventual merge of this branch to `main`, and smoke-test (sign in, open a draw, run a report) in the same session. If something in the policies is wrong (e.g., the cross-table `EXISTS` subqueries aren't planner-friendly on larger data), debug in a focused session rather than mid-feature.
- **Single-user single-owner assumption.** The new policies tighten RLS from "any authenticated session" to "user must own ≥1 project" + per-row project ownership. This is correct for the current deployment (one owner). If this app ever grows to multi-owner, the `loan_draws.project_id IS NULL` case (multi-project draws, which is the default today — all 3 existing draws have NULL `project_id`) would need a different check; right now a multi-project draw is visible to any user who owns any project.
- Pagination / vendor caps on the draw PDF routes (part of I12). Not blocking and only matters at unusual scale; leave to a cleanup pass.

**References:** Findings C8 (closed), C9 (closed), I5 (closed by migration 022 — pending apply), I12 (partially closed — auth gate added; memory-buffering and pagination deferred).

---

### Step 7 — Consolidate route-level `actions.ts` files ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged.

**What shipped:**

- **All 8 route-level `actions.ts` files are gone.** `find src/app/(app) -name actions.ts` returns nothing. Every server action now lives under `src/app/actions/`.
- **Dead code removed alongside the duplicate actions** (these were only imported by each other):
  - `src/app/(app)/contacts/ContactsClient.tsx` — superseded by `src/components/contacts/ContactsClient.tsx` (what the page actually renders).
  - `src/app/(app)/projects/NewProjectModal.tsx` — zero importers.
  - `src/app/(app)/projects/[id]/ProjectDetailClient.tsx` — zero importers. All its stages/cost-items/milestones/sales/build-stage functions died with it, which simplified the split (no need to preserve those into `stages.ts`).
  - `src/app/(app)/projects/[id]/edit/EditProjectForm.tsx` — shadowed by `src/components/projects/EditProjectForm.tsx` (what the edit page imports). The shadow copy was the only caller of the deleted `(app)/projects/actions.ts::updateProject` (FormData variant).
- **New central files created:** `src/app/actions/notifications.ts`, `src/app/actions/cost-codes.ts`, `src/app/actions/documents.ts`, `src/app/actions/field-logs.ts`.
- **Central files extended:**
  - `src/app/actions/vendors.ts` — added `deleteVendor(id)` (hard delete, scoped to `user_id`). `VendorsClient.tsx`'s inline form now converts FormData into the typed `VendorFormData` struct before calling the central action, filling unselected fields with nulls (the inline form only exposes name/trade/email/phone/COI/license).
  - `src/app/actions/projects.ts` — absorbed the selections CRUD (`createSelection`, `updateSelectionStatus`, `deleteSelection`) from `[id]/actions.ts`.
  - `src/app/actions/field-logs.ts` — absorbed both the cross-project field-log actions (`createFieldLog`, `createFieldTodo`, `updateTodoStatus`, `deleteTodo`, `uploadFieldLogPhoto`, `deleteFieldLogPhoto`) AND the project-scoped variants (`createProjectFieldLog`, `createProjectFieldTodo`, `updateProjectTodoStatus`) from `[id]/actions.ts`. One file, two section headers.
- **Callers rewired:** `FieldLogsClient.tsx`, `FieldLogPhotos.tsx`, `NewFieldLogForm.tsx`, `FieldLogsTab.tsx`, `DocumentsClient.tsx`, `NotificationsClient.tsx`, `SettingsClient.tsx`, `VendorsClient.tsx`, `SelectionsTab.tsx`. All now import from `@/app/actions/*`.
- **CLAUDE.md updated:** "Action file architecture" bullet now lists every central file and restates that no `(app)/**/actions.ts` files exist.

**Invariants after this step:**
- `find src/app/(app) -name actions.ts` returns empty.
- `grep -r 'from "\./actions"' src/app/(app)` and `grep -r '@/app/(app)/.*/actions"' src/` both return nothing.
- `npx tsc --noEmit` clean (EXIT=0).
- All server actions reachable via `@/app/actions/*`.

**Deferred / not done:**
- The dead-code deletion went beyond the plan's letter — I removed whole dead clients (not just the dupe actions files) when they had zero live importers. If the user wants any of those UIs back (e.g., the inline `NewProjectModal`), they're recoverable from git history.
- `src/app/actions/vendors.ts` was chosen as the canonical vendor API over the simpler FormData-based route-level variant. `VendorsClient.tsx`'s trimmed inline form now writes via the fuller typed API, so ACH / accounting-contact / notes fields on vendors edited through that form are preserved (read from the existing row) rather than clobbered to null. Watch for this if the inline edit UI ever gains new fields.
- Name-collision note for Step 11 / future work: `src/app/actions/stages.ts::updateStage` operates on `build_stages` (takes an input struct). The deleted `[id]/actions.ts::updateStage` operated on the `stages` table (took FormData). If someone ever needs generic `stages` table CRUD again, use different names (`createStageRow` etc.) — don't reuse `createStage`/`updateStage`/`deleteStage` as those now have semantic weight for `build_stages`.

**References:** Finding I1 (closed).

---

### Step 8 — Standardize form handling ✅ DONE

**Status:** Verified 2026-04-22 on branch `overhaul/step-2-gl-helpers`. All acceptance criteria met by prior steps' work — no new edits required in this pass.

**What was already in place:**
- `NewContactForm.tsx` — fully migrated to server action. Uses `createContact` from `@/app/actions/contacts` + `useTransition` + typed `ContactInput` struct. `inputCls` applied throughout. No direct `supabase.from().insert()`.
- `NewVendorForm.tsx` — deleted as part of Step 7's dead-code pass. The vendor "add" flow now lives in `VendorsClient.tsx`'s inline form, which writes via the central typed `createVendor` / `updateVendor` actions in `@/app/actions/vendors` (see Step 7 notes on the inline form's FormData-to-typed-struct conversion).
- `NewProjectForm.tsx` — deleted in Step 7. Project creation is now split across `src/components/projects/HomeConstructionForm.tsx` + `LandDevForm.tsx`, both of which already use server actions (`createHomeConstructionProject` / `createLandDevProject`).
- `contacts/[id]/page.tsx` — deleted in Step 7 (the route is no longer rendered; the contact-detail flow collapsed into `ContactsClient.tsx`).
- `contracts/[id]/page.tsx` — deleted in Step 7 (entire `(app)/projects/[id]/contracts/` subtree removed as dead code).

**Verification performed:**
- `find src/app/(app) -name page.tsx -exec grep -l '^"use client"' {} \;` returns empty. Zero client-side page.tsx under `(app)/`.
- `grep -n 'supabase.from.*insert' src/app/\(app\)/contacts/new/NewContactForm.tsx` returns nothing.
- `grep -n "inputCls" src/app/\(app\)/contacts/new/NewContactForm.tsx` shows every form field uses the shared constant.
- `npx tsc --noEmit` → EXIT=0.

**Known out-of-plan gap (not in Step 8 scope):** `NewCostForm.tsx` still writes via a client-side `supabase.from("cost_items").insert(...)` call and carries `// @ts-nocheck` (audit finding C10 + C12). This is intentional — `cost_items` is a legacy-schema ghost per Step 11. Migrating the form to a server action while still pointing it at the legacy table is wasted work. The form will be rewritten as part of the eventual C10 resolution, not here.

**References:** Findings I8, I9 — both closed (directly for Contact; transitively via deletion for Vendor, Project, and the two client `[id]` pages).

---

### Step 9 — Add prompt caching to Claude extraction routes ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged.

**What shipped:**
- New `src/lib/ai/extract.ts` — shared `extractStructured<T>({ systemPrompt, content, maxTokens })` helper. Owns the Anthropic client instance, model pin (`claude-sonnet-4-6`), `cache_control: { type: 'ephemeral' }` on the system prompt, JSON parsing with markdown-fence stripping, and typed `ExtractResult<T>` error propagation (`{ ok: true, data, usage }` / `{ ok: false, error, status }`). Uses the `system: [{ type: 'text', text, cache_control }]` array form rather than burying the system prompt as the first content block — identical caching behaviour, cleaner semantic separation.
- `src/app/api/invoices/extract/route.ts` — refactored to call `extractStructured<unknown>` with a pre-built content array (document block + per-request user instruction with optional projects list). Route retains its own normalisation (legacy single-object vs `{ invoices: [...] }`), 7-day-minimum due-date enforcement, and vendor/amount sanity check. `maxTokens: 2048`.
- `src/app/api/vendors/extract/route.ts` — same refactor; supports both PDF and image inputs via a `documentBlock` union built before the helper call. `maxTokens: 1024`.
- The `~460`-line system prompts are now cached: repeat calls within the 5-minute ephemeral TTL read the prompt from cache instead of re-sending. `message.usage.cache_read_input_tokens` populates on cache hits.

**Invariants after this step:**
- Only `src/lib/ai/extract.ts` instantiates the Anthropic client for extraction. Both routes import `extractStructured` — no direct `new Anthropic()` in route files.
- Both routes pin model to `claude-sonnet-4-6` via `EXTRACT_MODEL` in the helper (per CLAUDE.md).
- `npx tsc --noEmit` clean (EXIT=0).

**Deferred / not done:**
- No runtime cache-hit verification in this session — the change wasn't wired through a live request against the Anthropic API. The caching config matches the documented Anthropic pattern; first real upload after deploy should show `cache_creation_input_tokens > 0` and subsequent uploads `cache_read_input_tokens > 0`. Worth eyeballing once in prod logs.

**References:** Finding I6 (closed).

---

### Step 10 — Cleanup pass ✅ DONE

**Status:** Verified 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Every named task was already closed by incidental work in Steps 3–12. No new code edits in this pass; this step is a verification checkpoint.

**What was already in place:**
- **Repo-root artifacts** — `ui-redesign-prototype.jsx` and `how --oneline 0bee0929b978e7c349232803f6e71d37b206dd9c` were staged for deletion (`git diff --cached` shows `-1490` lines across both files).
- **`<ConfirmButton />` primitive** — lives at `src/components/ui/ConfirmButton.tsx`. Modal variant with destructive/neutral tones, pending-state handling, inline error display, optional `onSuccess` callback. All three named callers migrated: `DeleteLoanButton.tsx`, `DeleteContractButton.tsx`, and the `FieldLogsClient.tsx` / `DocumentsTab.tsx` delete flows.
- **Shared `inputCls` constant** — lives at `src/lib/ui/inputCls.ts` with `focus:ring-[#4272EF]`. Applied in `NewContactForm.tsx` and `NewCostForm.tsx`. `NewVendorForm.tsx` and `NewProjectForm.tsx` were deleted in Step 7.
- **`alert()` calls** — zero in `src/`. `grep -Rn "alert(" src | wc -l` → 0. The three named files (`FieldLogsClient`, `DocumentsTab`, `JournalEntriesClient`) all use `ConfirmButton` for destructive prompts; none use `alert()` for any purpose.
- **`proxy.ts` comment** — `src/proxy.ts:1` has: `// Uses the Next.js 15.3+ "proxy.ts" convention (new name for middleware.ts).`
- **`middleware.ts` generic** — `src/lib/supabase/middleware.ts:8` uses `createServerClient<Database>` with a proper `import type { Database } from "@/types/database"` at the top. No `<any>`.

**Verification performed:**
- `ls ui-redesign-prototype.jsx` + `ls "how --oneline ..."` → both "No such file."
- `ls src/lib/ui/inputCls.ts` → present.
- `grep -Rn "alert(" src | wc -l` → `0`.
- `grep "createServerClient<any>" src/lib/supabase/middleware.ts` → no match.
- `npx tsc --noEmit` → EXIT=0.

**Known out-of-plan gaps (not in Step 10 scope, noted for future):**
- 8 native `confirm()` calls remain outside the four files Step 10 named — mostly single-line row-action prompts in `InvoicesTable.tsx` (6), and one each in `VendorDocuments.tsx`, `SelectionsTab.tsx`, `PaymentRegisterClient.tsx`, `VendorsClient.tsx`, `SettingsClient.tsx`, `DocumentsClient.tsx`, `FieldLogPhotos.tsx`. These are chronic drift — the plan's letter ("replace three variants") is met but the spirit ("One delete UI") isn't. Suggest bundling into the "Step 13 — Important hardening" pass that Step 12 proposed for the remaining `I*` findings.
- Focus-ring drift elsewhere: `focus:ring-amber-400` / `focus:ring-blue-500` still live on ~45 files (loan forms, stage tracker, budget, invoices, login form, etc.). The plan only required the four named `New*Form` files; the shared `inputCls` constant is ready for a codebase-wide sweep whenever someone wants to spend the session.

**References:** Findings I13, M1–M6 — all closed (with the two known gaps above tracked for Step 13).

---

### Step 11 — Second-pass audit ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Audit only — no code changes. Findings below; promote any critical ones into follow-up steps before closing.

**Scope reviewed:** `actions/banking.ts` (495 LoC — one less than counted), `payments.ts`, `bank-transactions.ts`, `projects.ts`, `create-project.ts`, `stages.ts`, all `(app)/reports/**` pages, and the one edge function `supabase/functions/poll-gmail-invoices/index.ts`.

**Live-DB sanity check performed:** confirmed three legacy tables still exist with stale contents: `cost_items` (118 rows — stale; canonical `project_cost_codes` has 410), `stages` (0 rows — canonical `build_stages` has 330), `sales` (0 rows — not in CLAUDE.md schema at all). Seven files still read from these (see C10 below).

#### 🔴 Critical

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| C10 | `src/app/(app)/reports/page.tsx:12-15` + `ReportsClient.tsx` | Top-level `/reports` dashboard reads from legacy tables `cost_items`, `stages`, `sales`. Live DB has 118 / 0 / 0 rows in them vs. 410 / 330 in the canonical `project_cost_codes` / `build_stages`. Dashboard shows stale or empty numbers. Six more files depend on the same legacy tables: `costs/page.tsx`, `costs/new/NewCostForm.tsx`, `costs/new/page.tsx`, `projects/[id]/stages/new/NewStageForm.tsx`, `projects/[id]/sales/new/NewSaleForm.tsx`, `projects/[id]/milestones/new/page.tsx`. | Migrate reads to `project_cost_codes` + `build_stages`. Drop `sales` references — no canonical table exists. Decide whether the legacy tables should be dropped (see Step 1 notes: schema source-of-truth is the live DB, so dropping requires a new migration AND cleaning up the 7 callers). |
| C11 | `src/app/(app)/reports/ReportsClient.tsx:12` | Currency is hardcoded to AUD (`Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })`). This is a US construction company — all financial displays show Australian dollars. Audit CLAUDE.md + the Design section: brand color is `#4272EF`, app serves a residential home builder; no locale context suggests AUD. | Change to `"en-US"` / `"USD"`. Grep the repo for `"en-AU"` / `"AUD"` — if it's used elsewhere, same fix. |
| C12 | `src/app/actions/payments.ts:1`, `src/app/actions/projects.ts:1` | `// @ts-nocheck` on 994 + 422 LoC of the accounting + project-CRUD core. Real type errors are silenced (e.g. `payments.ts` freely reads `.projects` / `.cost_codes` off joins without null-narrowing; `projects.ts` casts `status` strings without validation). | Remove the `@ts-nocheck` directive in each, fix the fallout. Start with `projects.ts` (shorter surface area). Do NOT silence individual errors with `as any` — each one is a real bug or missing null-check. |
| C13 | `src/app/actions/payments.ts:113-196` (`createPayment`) | Partial-state failure path: `payments` row inserted at line 113, `payment_invoices` at 143, THEN the "ensure wip_ap_posted" loop at 165. If auto-approve fails on invoice #N (line 193), the function returns an error but the payment row and its invoice links already exist. User sees an error; DB has a dangling payment. The UI has no way to retry safely (re-submitting creates a second payment). | Move the prerequisite loop (lines 165-196) BEFORE the payment insert. Verify every invoice is payable first, then insert atomically. Or wrap the whole thing in an rpc/SQL function (same pattern Step 3 deferred for `fundDraw`). |
| C14 | `src/app/actions/create-project.ts:147-155, 250-258`; `src/app/actions/projects.ts:104-111` (`ensureLoan`) | Auto-created loan rows omit `coa_account_id`. The full `createLoan` flow in `banking.ts:157-187` mints a per-loan `chart_of_accounts` row and stores its id on the loan. These short-cut paths (loan number entered on project creation / edit) skip that — they insert the loan with `coa_account_id = NULL`. `fundDraw` (`draws.ts`) looks up `loans.coa_account_id` to determine the Loan Payable credit account; a draw against one of these short-cut loans will either throw or post to a null account. | Either (a) refuse to create a loan from the project path — force the user through the Loans page for the real flow, or (b) replicate `createLoan`'s COA-account mint logic in `createHomeConstructionProject` / `createLandDevProject` / `ensureLoan`. Option (a) is simpler and forces intentional GL setup. |
| C15 | `src/app/actions/projects.ts` — `updateHomeProject` (36), `updateLandProject` (62), `ensureLoan` (88), `deleteProject` (118), `updatePhaseLotsSold` (129), `saveDocument` (147 — only has `getUser` check), `addProjectCostCode` (183), `addProjectCostCodes` (201), `updateCostCodeBudget` (221), `removeProjectCostCode` (237), `createPhase` (254), `updatePhase` (285), `deletePhase` (319), `getInvoicesForCostCode` (349 — has `getUser`), `createSelection` (404), `updateSelectionStatus` (417), `deleteSelection` (431), `deleteDocument` (444). Also `stages.ts::updateStage` (21) and `resetSchedule` (106). | Missing `requireAdmin()` / `getUser()` checks. Actions rely entirely on RLS. Every other actions file (`banking.ts`, `invoices.ts`, `draws.ts`, `payments.ts`, `bank-transactions.ts`) does both as defense-in-depth. RLS policies for `projects` / `project_cost_codes` / `project_phases` / `documents` / `selections` / `build_stages` need to be verified airtight; any gap turns these actions into unauthenticated endpoints. | Add `const adminCheck = await requireAdmin(); if (!adminCheck.authorized) return { error: adminCheck.error };` + `getUser()` null-check to every function in both files. Match the pattern already used in `banking.ts`. |
| C16 | `supabase/functions/poll-gmail-invoices/index.ts:198-222` | The edge function's Anthropic call has no `cache_control: { type: "ephemeral" }` on the system prompt (only the two HTTP routes were fixed in Step 9). Every invoice processed re-sends the ~3KB cost-code prompt. On a steady-state Gmail poll (every 5 min with a few invoices/day) it's small waste, but meaningful in a busy week. | Switch to the `system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]` shape used in `src/lib/ai/extract.ts`. Cannot import the helper (different runtime — Deno) but the pattern is 4 lines. |
| C17 | `supabase/functions/poll-gmail-invoices/index.ts:406-425` | Inserts `line_items: lineItems` as a field on the `invoices` row. Per CLAUDE.md schema, line items belong in the separate `invoice_line_items` table (joined by invoice_id). Either the insert silently drops the field, OR the live `invoices` table has an undocumented `line_items` JSON column that's out of sync with the schema elsewhere. Either way: email-ingested invoices bypass the line-item sum-equals-amount validation and won't roll up in any query that joins `invoice_line_items`. | Check live DB for `invoices.line_items` column. If absent, remove the field from the insert, and insert a separate `invoice_line_items` batch keyed by the new invoice id. If present, document it in CLAUDE.md and consolidate. |

#### 🟡 Important

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| I14 | `src/app/actions/payments.ts:585-589` (`voidPayment`) | Reverts linked invoices to `'approved'` regardless of their current state. If an invoice was `cleared`, history is erased — no audit trail it was ever cleared. Also nulls `payment_date` / `payment_method`. | Block `voidPayment` when any linked invoice is `cleared` (same rule Step 4 applied to `disputeInvoice` / `voidInvoice`). Route through `applyStatusTransition` to keep state transitions centralized. |
| I15 | `src/app/actions/banking.ts:142-170` (`createLoan`) | COA account numbering is read-then-insert. Two parallel creates will read the same `max(account_number)` and both insert `2205`. No unique constraint on `chart_of_accounts.account_number` in the baseline (confirmed). Single-user today, but the failure mode is silent: two loans pointing at the same liability account → balance sheet can't tell them apart. | Add `UNIQUE (account_number)` to `chart_of_accounts` in a new migration, wrap the insert in a retry loop that catches the unique-violation and increments. Or use a Postgres sequence. |
| I16 | `src/app/actions/banking.ts:157-190` (`createLoan`) | If the COA row inserts successfully but the `loans` insert fails, the COA row is orphaned. No rollback. | Delete the COA row on `loans` insert failure, or invert the order: insert loan first with `coa_account_id = NULL`, then insert COA, then update loan. |
| I17 | `src/app/actions/bank-transactions.ts:113-115` (`parseBankCSV`) | Naive `line.split(",")`. Any description with a comma (common in bank exports — e.g. "PAYMENT, INC") misaligns columns for that row. The whole row's amounts / categorization is corrupted. | Use a minimal CSV parser that handles quoted fields. `papaparse` is ~10KB; or hand-roll a state machine over the line. |
| I18 | `src/app/actions/bank-transactions.ts:338-349` (`autoMatchTransactions` loan advances) | Sets `match_status = "matched"` even when the JE lookup returned nothing (`jeId = null` at 338). The row is marked matched but has no `matched_journal_entry_id` — in the reconciliation UI it looks matched but isn't linkable. | Only transition to `matched` if `jeId` is not null; otherwise keep as `unmatched` and annotate via `notes`. |
| I19 | `src/app/actions/bank-transactions.ts:366` (interest match) | `.ilike("loan_number", "%${loanRef}")` — `loanRef` comes from regex extraction on the description. Unsanitized, so `%` or `_` in the extracted string is interpreted as a SQL wildcard. Also `loans[0]` picks arbitrarily if multiple match. | Escape `%` / `_` in `loanRef` before interpolating. If `loans.length > 1`, skip the match and leave as unmatched with a note. |
| I20 | `src/app/actions/stages.ts:60-62` | `Math.round((actualEnd - plannedEnd) / 86400000)` drifts ±1 day across DST boundaries. A stage completed on a Sunday in March across a DST boundary gets the wrong shift delta, skewing every downstream stage by a day. | Compare `YYYY-MM-DD` strings directly (parse into y/m/d, convert via `Date.UTC`), or use `date-fns`' `differenceInCalendarDays`. Keep the input type as `string` — don't pipe through `Date` at all. |
| I21 | `src/app/actions/stages.ts:137-165` (`resetSchedule`) | Sequential upserts with zero error checking. If stage #20 fails to update, stages 1-19 are already updated, stages 21-54 skipped, no error is surfaced. | Collect errors, return the first one, and either abort partway (stages reset partially) or add an rpc. For a user-facing "reset" button the current silent-partial behaviour is worse than throwing. |
| I22 | `src/app/actions/stages.ts:73-87` | `Promise.all` of N updates, only returns the first failure. If multiple fail, you see one error and a half-shifted schedule. | Return the list of failed ids and roll back successful shifts if any fail. Or at minimum log all failures before surfacing the first. |
| I23 | `src/app/actions/projects.ts:448-463` (`deleteDocument`) | Deletes from storage first, then from DB. If DB delete fails, the file is gone but the `documents` row still points at a dead storage path — UI shows a broken document. | Swap order: delete DB row first, then storage. An orphaned storage file is recoverable; a dangling DB pointer is not. |
| I24 | `supabase/functions/poll-gmail-invoices/index.ts:102-122` (`findVendor`) | Containment match is too greedy: "ABC" in "Plumbing ABC Services" resolves to the wrong vendor. The normalize step also strips common words aggressively (`llc`, `inc`, `co`, `company`), collapsing distinct vendors ("Co Plumbing" / "Co Electric" could dedupe). | Require a minimum token overlap (e.g. ≥2 shared normalized tokens) or require the extracted name to start-with / end-with the candidate. Or abandon fuzzy matching and fall back to null (review-flagged) more eagerly. |
| I25 | `supabase/functions/poll-gmail-invoices/index.ts:254-256` (`findProjectByHint`) | Builds a PostgREST `.or()` filter by interpolating the raw extracted string into `name.ilike.%${hint}%,address.ilike.%${hint}%,subdivision.ilike.%${hint}%`. `hint` comes from Claude-extracted text and is not escaped. A comma or `)` in the hint breaks the filter DSL; a `%` acts as a wildcard. Not a SQL injection per se (PostgREST) but reliable bad-query. | Escape `,` and `)` in the hint before interpolation, or drop to three sequential queries and `.union`. |
| I26 | `supabase/functions/poll-gmail-invoices/index.ts:405-425` | Invoice insert has no `.select()` / error rollback. If the insert returns an error, the uploaded file in storage is orphaned (see I23 pattern). | Upload file AFTER successful invoice insert, or rollback the storage upload if the insert fails. |
| I27 | `src/app/actions/payments.ts:198-211` (`createPayment` invoice-status bulk update) | `.in("id", invoiceIds)` update is unchecked — no `.eq("status", expectedPriorStatus)` predicate. If one of the invoices got its status changed by a parallel action between the auto-approve loop (line 165) and this update (line 207), we silently overwrite with `released` / `cleared`. | Update with `.in("id", invoiceIds).eq("status", "approved")` and check the affected row count equals `invoiceIds.length`; error if not. |
| I28 | `src/app/actions/payments.ts:329-333` (`createPayment` discount_taken) | `update({ discount_taken: share })` overwrites any previous `discount_taken` on the invoice. If an invoice was ever partial-paid (future) or re-paid after a void, the original discount is lost. | Accumulate instead of overwrite: `discount_taken = discount_taken + share`. Or forbid re-payment at the UI level. |

#### 🟢 Minor

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| M8 | `src/app/actions/bank-transactions.ts:79` (`categorize`) | `d.includes("WIRE")` matches "FIREWIRE", "WIRELESS", etc. Unlikely in bank descriptions but fragile. | Use `\bWIRE\b` regex or require leading whitespace. |
| M9 | `src/app/actions/bank-transactions.ts:544` (`getReconciliationSummary`) | No `requireAdmin()` check — lone exception in the file. | Add it to match the rest of the module. |
| M10 | `src/app/actions/banking.ts:309` (`accrueConstructionInterest` reference) | `INT-{loan-slice-8}-{YYYY-MM}` — two accruals in the same month on the same loan (e.g. prorated at year-end) collide. No uniqueness enforced on `journal_entries.reference`. | Append a sequence or the day: `INT-{loan8}-{YYYY-MM-DD}`. |
| M11 | `src/app/actions/banking.ts:36, 63` | `account_last_four` is silently truncated to last 4 chars via `.slice(-4)`. If a user types a full account number, it's silently stripped — UI should either mask input or reject too-long input. | Either hard-reject >4 digits with an error, or document the trim in the input placeholder. |
| M12 | `src/app/actions/bank-transactions.ts:238` (autoMatch) | After check-match fails via `vendor_payments`, the "still unmatched" filter at 271 re-executes the same logic inside a `filter()` callback rather than tracking matched ids in a `Set`. O(n²) for large batches. | Track matched txn ids in a `Set<string>` as they're processed; skip them in later loops. |
| M13 | `src/app/(app)/reports/ReportsClient.tsx:49-50` | `p.total_budget` / `c.budgeted_amount` dereferenced without null check. `total_budget` is nullable per schema; arithmetic on null yields `NaN`. | `(p.total_budget ?? 0)`, same for all other sum reducers. |
| M14 | `supabase/functions/poll-gmail-invoices/index.ts:188` | `btoa(String.fromCharCode(...buffer))` is unsafe for large PDFs — the spread into `fromCharCode` hits JS argument limits (~65k) for files >65KB. | Convert via `Uint8Array.toBase64()` (Deno supports it natively) or chunk the `fromCharCode` in slices of 8192. |
| M15 | `src/app/actions/payments.ts:200` | Maps `auto_draft` → `ach` for the invoice's `payment_method` column, but elsewhere the payment's own `payment_method` stays as `auto_draft`. Invoices table loses the distinction. | Add `'auto_draft'` to the invoice `payment_method` enum/check constraint, OR document the lossy mapping in CLAUDE.md. |
| M16 | `supabase/functions/poll-gmail-invoices/index.ts:271-276` | Non-null-asserts `SUPABASE_URL` / `SERVICE_ROLE_KEY` / OAuth env vars at module load. If any is unset on deploy, the function fails with a confusing "null" error instead of a named missing-env error. | Throw an explicit error at load (e.g. `throw new Error("SUPABASE_URL is required")`) instead of `!`. |

#### Cross-cutting observations

- **Auth discipline is uneven.** `banking.ts`, `payments.ts`, `bank-transactions.ts`, `draws.ts`, `invoices.ts` all do `requireAdmin()` + `getUser()`. `projects.ts`, `stages.ts`, `create-project.ts` mostly skip both. If RLS on `projects` / `build_stages` / `project_cost_codes` is tightened in Step 6's spirit, these actions need matching server-side gates — C15 bundles the full list.
- **`// @ts-nocheck` is load-bearing.** `payments.ts` and `projects.ts` both use it. Removing it will surface real bugs (confirmed by spot-reading: `payments.ts:311` accesses `inv.projects.project_type` off a join result that TypeScript would type as `{} | { project_type: string }[] | null`).
- **Legacy schema ghosts.** `cost_items`, `stages`, `sales` tables exist alongside canonical `project_cost_codes`, `build_stages`, (no sales). Seven files still read from them. Worth a dedicated "kill the legacy-schema ghosts" step before the next big feature touches project costing.
- **Edge functions lack the Step 9 caching work.** Only one function exists today, but if more edge extractions are added they should share a caching helper the way `src/lib/ai/extract.ts` does for the HTTP routes.
- **No test coverage on any of this.** Bugs like C13 (partial payment-state) and I20 (DST drift) would show up in integration tests but there aren't any. Worth flagging but out of scope for this audit.

**Promote to actionable steps:** C10, C12, C14, C15, C17 are the highest-leverage code changes — recommend folding them into a "Step 12 — Close Step 11 criticals" pass. C11 is a two-line fix worth bundling into Step 10. C13 wants its own focused session because the fix changes the ordering contract of `createPayment`.

**References:** closes the Step 11 goal; opens C10-C17, I14-I28, M8-M16.

---

### Step 12 — Close Step 11 criticals ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged. Typecheck clean (`npx tsc --noEmit` EXIT=0). Live preview could not be booted in this session — the branch worktree has no `.env.local` — so the AUD→USD change was verified via typecheck + source inspection only. Smoke-test visually once the branch lands in an env with Supabase keys.

**In scope (closed):** C11, C13, C14, C15, C16, C17. Bonus: I16 and I23 were cheap additions while editing the same files — closed in the same step.

**Deferred (still open):**
- **C10** (legacy-schema ghosts: `/reports` dashboard plus six more callers of `cost_items` / `stages` / `sales`) — 7 files, semantic migration to canonical tables, needs its own step.
- ~~**C12** (remove `// @ts-nocheck` from `payments.ts` + `projects.ts`)~~ — closed in **Step 13** below.

**What shipped:**

- **C11 (AUD → USD).** 10 edits across 6 files — `ReportsClient.tsx:12`, `CostsClient.tsx:12` (currency formatters); `NotificationsClient.tsx:29`, `DocumentsClient.tsx:262` (date locale); labels on `NewCostForm.tsx`, `NewStageForm.tsx`, `NewSaleForm.tsx` (AUD → USD). The three label files are on the C10 legacy-form list, but the text fix is independent of the eventual migration — no point leaving "Budgeted (AUD)" on screen in the interim.
- **C13 (`createPayment` reorder).** Moved the `wip_ap_posted` prerequisite loop (`payments.ts:165–196` in the pre-edit file) to run BEFORE the `payments` row insert. `invoiceIds` + `newInvoiceStatus` were lifted out of the old inline block and hoisted near the top of the function (lines 111–112). Failure mode now: a prerequisite-check error returns cleanly without a dangling `payments` / `payment_invoices` row. Invoices that auto-approved before the failing one remain approved (correct — the approval's DR WIP / CR AP is durable), but there's no phantom payment to reconcile.
- **C14 (project-path loans get a COA account).** Extracted `mintLoanCoaAccount(supabase, projectId, loanNumber)` in `banking.ts:10` — reads project_type, picks the next free 2201+ account number, inserts a `chart_of_accounts` row, returns `{ coaAccountId }`. Wired it into `createLoan` (banking.ts) — replacing the inline code — and into `createHomeConstructionProject` / `createLandDevProject` (create-project.ts) and `ensureLoan` (projects.ts). Every loans row now has a non-null `coa_account_id`, so `fundDraw` can always post the Loan Payable JE. Also closed **I16** while there: all four sites now delete the orphaned COA row if the `loans` insert fails.
- **C15 (auth checks).** Added `requireAdmin()` gates to 16 functions: `updateHomeProject`, `updateLandProject`, `ensureLoan`, `deleteProject`, `updatePhaseLotsSold`, `saveDocument`, `addProjectCostCode`, `addProjectCostCodes`, `updateCostCodeBudget`, `removeProjectCostCode`, `createPhase`, `updatePhase`, `deletePhase`, `createSelection`, `updateSelectionStatus`, `deleteSelection`, `deleteDocument` in `projects.ts`; `updateStage`, `resetSchedule` in `stages.ts`. Selections CRUD still uses `throw new Error()` (they're called from form `action={…}` attributes) — the gate throws on unauthorized rather than returning. `getInvoicesForCostCode` kept its existing `getUser()` check and NO `requireAdmin()` — it's a read, and non-admin project_manager users need it. Also closed **I23** while there: `deleteDocument` now deletes the DB row first, then storage — a failed DB delete used to leave a dangling pointer to a missing file.
- **C16 (edge function prompt caching).** Switched the Anthropic call at `poll-gmail-invoices/index.ts:198-222` from `system: SYSTEM_PROMPT` (string) to `system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]`. Matches the pattern now used by `src/lib/ai/extract.ts`. First poll after deploy mints the cache; subsequent polls within the ~5-min TTL read from cache.
- **C17 (edge function schema fix).** Rewrote the invoice insert at `poll-gmail-invoices/index.ts:405+`. Dropped four columns that do not exist on the live `invoices` table (`vendor_name`, `file_name_original`, `created_by`, `line_items`) — these were why the edge function's invoice-creation path was broken. Canonical columns: `vendor`, `file_name`, `user_id`, and line items in the separate `invoice_line_items` table. New flow: insert invoice row, capture the id, insert `invoice_line_items` batch keyed by it, roll back the invoice row if the line-item insert fails. Also writes `total_amount` alongside `amount` to stay consistent with the rest of the codebase.

**Invariants after this step:**
- `grep -rn '"AUD"' src` returns nothing; `grep -rn '"en-AU"' src` returns nothing.
- `grep -rn '"(AUD)"' src` returns nothing in label strings.
- In `projects.ts` and `stages.ts`, every exported async function starts with `requireAdmin()` (or the throwing equivalent for selections) — exception: `getInvoicesForCostCode` which is a read.
- Every `loans` insert in the codebase sets `coa_account_id` via `mintLoanCoaAccount`. Grep: `.from("loans").insert(` returns 4 matches, all 4 pass `coa_account_id`.
- `.from("invoices").insert(` in the edge function no longer contains `vendor_name` / `file_name_original` / `created_by` / `line_items` keys.
- `npx tsc --noEmit` → EXIT=0.

**Deferred within this step's scope:**
- I18 (auto-match loan advances setting `matched` even when no JE found), I19 (ilike wildcard injection), I17 (CSV split naive), I14 (voidPayment cleared-invoice handling), I15 (COA account_number race), I20–I22 (stages.ts DST and error-handling), I24–I26 (poll-gmail vendor/project matching + upload-before-insert), I27–I28 (createPayment status predicate + discount accumulation). All important but none block a fresh environment. Group into a future "Step 13 — Important hardening" pass.
- **C10** and **C12** (see above).
- **Migration 022 (Step 6)** is still un-applied to live DB; apply alongside this branch's merge.

**Preview verification NOT done:** the branch worktree has no `.env.local`; the dev server starts but can't connect to Supabase. The AUD→USD visual change is trivial (format-string swap) and typechecks clean. Suggest eyeballing `/reports` and `/costs` once the branch is in an env with keys, and spot-checking that `/banking/loans`'s "New Loan" still creates a `chart_of_accounts` row alongside the loan.

**References:** Findings C11, C13, C14, C15, C16, C17 closed. Bonus: I16, I23 closed.

---

### Step 13 — Remove `@ts-nocheck` from `payments.ts` + `projects.ts` (C12) ✅ DONE

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged. Typecheck clean (`npx tsc --noEmit` EXIT=0). Verification via typecheck + grep only; no browser observable behaviour change.

**Surprise:** the expected type-error cascade didn't materialize. Step 11 predicted "guaranteed to cascade into real type fixes" and flagged `payments.ts:311` accessing `inv.projects.project_type` off an un-narrowed PostgREST join. That specific site now reads `(inv.projects as { project_type: string } | null)?.project_type` — a narrow, justified cast that was already in place (probably added incidentally during one of the Step 12 / later edits). With the directive removed, `payments.ts` compiled with zero errors. `projects.ts` compiled with one error.

**What shipped:**

- **`projects.ts` — 1 fix.** `updatePhase` input-type widened `lots_sold?: number | null` → `lots_sold?: number`, and the Update payload switched from `lots_sold: data.lots_sold ?? null` to `lots_sold: data.lots_sold`. The schema column is `NOT NULL` with a default of 0, so `null` was never a valid write. The only caller (`src/components/projects/tabs/PhasesTab.tsx:44`) already passes a concrete number via `parseForm` (`parseInt(...) ?? 0`) — the `?? null` fallback was never exercised at runtime. No downstream fix needed.
- **`payments.ts` — 0 fixes.** Clean compile after removing the directive. The single narrow cast at the discount-distribution join (line 338) handles the only corner PostgREST's generic types don't resolve.

**Invariants after this step:**
- `grep -n "ts-nocheck" src/app/actions/payments.ts src/app/actions/projects.ts` → no matches.
- `grep -n "as any" src/app/actions/payments.ts src/app/actions/projects.ts` → no matches.
- `grep -n "as unknown as" src/app/actions/payments.ts src/app/actions/projects.ts` → no matches.
- `npx tsc --noEmit` → EXIT=0.

**Remaining `@ts-nocheck` in the codebase (not in Step 13 scope):**
- `src/app/actions/draws.ts` — the other action-file god-module. Next on the cleanup list if the user wants to push type safety through the rest of the action layer.
- `src/app/actions/project-costs.ts` — smaller file; deferred because it reads/writes the legacy `cost_items` table (C10 territory). Fix alongside the C10 migration.
- `src/app/(app)/costs/new/NewCostForm.tsx` — same C10 deferral as called out in Step 8.

**References:** Finding C12 (closed).

---

### Step 14 — Kill the legacy-schema ghosts (C10) ✅ DONE (migration not yet applied)

**Status:** Completed 2026-04-22 on branch `overhaul/step-2-gl-helpers`. Not yet merged. Typecheck clean (`npx tsc --noEmit` EXIT=0). **Migration `023_drop_legacy_schema_ghosts.sql` is committed but NOT applied to live DB** — same deferral pattern as migration 022 (Step 6).

**Live-DB confirmation done before touching anything:** `cost_items` had 118 stale rows (canonical `project_cost_codes` has 410), `stages` / `sales` / `milestones` had 0 rows each. Dropping the latter three is lossless; dropping `cost_items` discards 118 rows that nothing reads anymore. Confirmed `cost_codes.category` is a 19-value enum identical to the legacy `cost_items.category` enum, so the category-grouping UI carries over without translation.

**What shipped:**

- **`/reports` dashboard migrated.** [src/app/(app)/reports/page.tsx](src/app/(app)/reports/page.tsx) now reads `project_cost_codes` (joined to `cost_codes` for code/name/category) for budgeted amounts and `invoice_line_items` (joined to `invoices` for status filter — `approved`, `scheduled`, `released`, `cleared`) for actual spend. [src/app/(app)/reports/ReportsClient.tsx](src/app/(app)/reports/ReportsClient.tsx) rebuilt around this shape: per-project summary table now shows budgeted / actual / variance / % used (the old revenue and gross-profit columns are gone — no canonical replacement for `sales`). Category breakdown uses `cost_codes.category`. Status pill mapping kept unchanged.
- **`/costs` deleted entirely.** The whole `src/app/(app)/costs/` subtree is gone — `page.tsx`, `CostsClient.tsx`, `new/page.tsx`, `new/NewCostForm.tsx`. The page wasn't in the sidebar nav, and its function (browseable per-cost-code budget vs actual with project + category filters and CSV export) is fully covered by `/reports/budget-variance`, which is in the nav and already reads from canonical tables. Migrating a duplicate page would have been wasted work.
- **Three orphan `/new` form routes deleted:**
  - `src/app/(app)/projects/[id]/stages/new/` (whole dir — including the redirect-only `page.tsx` that bounced to `/projects/${id}/stages` and the dead `NewStageForm.tsx`).
  - `src/app/(app)/projects/[id]/sales/` (whole dir — only contained `new/`; no canonical Sales tab exists in `ProjectTabs.tsx`).
  - `src/app/(app)/projects/[id]/milestones/` (whole dir — same as Sales, no canonical Milestones tab).
- **Dead `src/components/projects/TabNav.tsx` deleted** — it referenced a `sales` tab that no longer exists, and grep confirmed zero importers (the canonical project-page nav is `ProjectTabs.tsx`).
- **Migration 023 written:** `supabase/migrations/023_drop_legacy_schema_ghosts.sql` does `DROP TABLE IF EXISTS … CASCADE` on `milestones`, `cost_items`, `stages`, `sales` (in that order — milestones FK-references stages, so it goes first). Header comment documents the row counts at audit time and the rationale. Two enums (`sale_type`, `stage_status`) become orphaned by this drop but are intentionally NOT dropped to dodge ordering pain — a follow-up migration can sweep them.

**Invariants after this step:**

- `grep -rn 'from\("(cost_items\|stages\|sales\|milestones)"\)' src` returns nothing. The only remaining hits for those names are in `src/types/database.ts` (stale type defs — will be pruned when types are regenerated post-migration-apply).
- `find src/app/\(app\)/costs` returns nothing.
- `find src/app/\(app\)/projects/\[id\]/sales src/app/\(app\)/projects/\[id\]/milestones src/app/\(app\)/projects/\[id\]/stages/new` returns nothing.
- `ls src/components/projects/TabNav.tsx` errors with "No such file."
- `npx tsc --noEmit` → EXIT=0.

**Deferred / not done:**

- **Migration 023 not applied to live DB.** Same reasoning as 022: code changes are independent and safe to ship now (no live read paths touch the four tables); dropping the tables is the cleanup tail. Apply alongside the eventual merge — same window as 022. Smoke-test `/reports` and `/projects/[id]?tab=budget` after.
- **`src/types/database.ts` not regenerated.** Once migrations 022 + 023 are applied, regenerate types from the live DB. This will drop the stale `cost_items`, `stages`, `sales`, `milestones` table types — at which point `StageStatus` import in `src/app/(app)/projects/[id]/stages/StageTrackerClient.tsx` (file is `// @ts-nocheck`) will need attention, though that file is also reading from a `project_stages` table that's not in the canonical CLAUDE.md schema — separate cleanup.
- **Preview verification NOT done:** the worktree has no `.env.local` so the dev server can't connect to Supabase (proxy-layer error before any page renders). Same gap as Step 12. The dev server compiles the new code without errors and Turbopack regenerates its route table after the route deletions cleanly. Suggest opening `/reports` in an env with Supabase keys after merge to eyeball the rebuilt summary table.
- **Legacy-related orphan enums** (`sale_type`, `stage_status`) and the orphaned `project_stages` / `stage_photos` / `stage_documents` schema island that `StageTrackerClient.tsx` references — out of C10 scope, separate cleanup.

**References:** Finding C10 (closed).

---

## What To Leave Alone

- **`proxy.ts` naming** — Next.js 15.3+ convention, not a typo.
- **`as unknown as SupabaseClient<Database>` cast** in `server.ts`/`client.ts` — documented workaround for a real `@supabase/ssr` generics issue.
- **`components/ui/` hand-rolled primitives** — small, focused, not duplicated. Don't pull in a component library just to match a convention.
- **Overlap between `markVendorPaymentPaid` (draws.ts) and `createPayment` (payments.ts)** — intentional recovery path. Just add the idempotency constraint from I11, don't merge.
- **No global store (Redux/Zustand)** — Server Component + Server Action + scoped Context is right for this app size.
- **Inline error rendering with `text-red-600 bg-red-50`** — fine as-is once the `alert()` holdouts are fixed.
- **Generated `database.ts`** — out of sync with migrations but in sync with live DB. Keep regenerating from the live DB; fix is on the migrations side (Step 1).
