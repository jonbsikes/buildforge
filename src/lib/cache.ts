import { revalidatePath } from "next/cache";

// Centralized cache-invalidation helpers. Each named helper invalidates
// every route surface that reads the data domain it covers. Server actions
// call the helpers that match what they mutated, so removing
// `dynamic = "force-dynamic"` from pages is safe — mutations still flush
// the right routes.

function revalidateAppHeader() {
  // Notification bell + display name live in the app shell header.
  revalidatePath("/", "layout");
}

export function revalidateFinancialReports() {
  revalidatePath("/financial", "layout");
  revalidatePath("/dashboard");
}

export function revalidateInvoiceViews(invoiceId?: string) {
  revalidatePath("/invoices");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
}

export function revalidateDrawViews(drawId?: string) {
  revalidatePath("/draws");
  if (drawId) revalidatePath(`/draws/${drawId}`);
}

export function revalidateBankingViews() {
  revalidatePath("/banking", "layout");
}

export function revalidateProjectViews(projectId?: string) {
  revalidatePath("/projects");
  revalidatePath("/projects/tree");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

export function revalidateReportsViews() {
  revalidatePath("/reports", "layout");
}

// Anything that posts to journal_entries: invoice approve/release/clear,
// draw fund, manual JE, payment, monthly accrual, lot cost, etc.
export function revalidateAfterJournalEntry(opts: {
  invoiceId?: string;
  drawId?: string;
  projectId?: string;
} = {}) {
  revalidateFinancialReports();
  revalidateInvoiceViews(opts.invoiceId);
  revalidateDrawViews(opts.drawId);
  revalidateBankingViews();
  if (opts.projectId) revalidatePath(`/projects/${opts.projectId}`, "layout");
  revalidatePath("/dashboard");
}

// Invoice mutation that does NOT post a JE (saveInvoice on pending_review,
// setPendingDraw, dispute, void before approval, manual review flag, edits).
export function revalidateAfterInvoiceMutation(opts: {
  invoiceId?: string;
  projectId?: string;
} = {}) {
  revalidateInvoiceViews(opts.invoiceId);
  revalidateDrawViews();
  if (opts.projectId) revalidatePath(`/projects/${opts.projectId}`, "layout");
  revalidatePath("/dashboard");
}

// Draft-draw assembly: createDraw, removeInvoiceFromDraw, deleteDraw.
// No JE posted, but the drawable-invoices list on /invoices is affected.
export function revalidateAfterDrawAssembly(drawId?: string) {
  revalidateDrawViews(drawId);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

// Project mutations: create/update/delete, cost-code add/remove, budget
// edits, phase create/update, selections, project-level documents.
export function revalidateAfterProjectMutation(projectId?: string) {
  revalidateProjectViews(projectId);
  revalidateReportsViews();
  revalidateFinancialReports();
}

// Build stage updates (status, dates, schedule reset).
export function revalidateAfterStageMutation(projectId?: string) {
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/reports/stage-progress");
  revalidatePath("/reports/gantt");
  revalidatePath("/dashboard");
}

// Vendor mutations (name, trade, COI/license, deactivate, delete).
export function revalidateAfterVendorMutation() {
  revalidatePath("/vendors");
  revalidatePath("/invoices");
  revalidatePath("/financial/vendor-spend");
  revalidatePath("/banking/payments");
}

// Contract mutations (create/update/delete a vendor contract).
export function revalidateAfterContractMutation(projectId?: string) {
  revalidatePath("/contracts");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/vendors");
}

// Contact mutations (lenders, owners).
export function revalidateAfterContactMutation() {
  revalidatePath("/contacts");
  revalidatePath("/banking/loans");
  revalidatePath("/projects", "layout");
}

// Bank account / loan / loan COA changes.
export function revalidateAfterBankingMutation() {
  revalidateBankingViews();
  revalidateFinancialReports();
}

// Bank transaction import / match / unmatch / ignore.
export function revalidateAfterBankTransactionMutation(accountId?: string) {
  revalidatePath("/banking/reconciliation");
  if (accountId) revalidatePath(`/banking/accounts/${accountId}`);
  revalidatePath("/financial/cash-flow");
  revalidatePath("/dashboard");
}

// Field log + field-log photo create/update/delete.
export function revalidateAfterFieldLogMutation(projectId?: string) {
  revalidatePath("/field-logs");
  revalidatePath("/reports/field-logs");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
}

// Project todo create/complete/delete (also covers field todos).
export function revalidateAfterTodoMutation(projectId?: string) {
  revalidatePath("/todos");
  revalidatePath("/field-logs");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
}

// Document upload/delete (project-scoped or company-level).
export function revalidateAfterDocumentMutation(projectId?: string) {
  revalidatePath("/documents");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

// Notification mark-read.
export function revalidateAfterNotificationMutation() {
  revalidatePath("/notifications");
  revalidateAppHeader();
}

// Master cost-code mutations (admin).
export function revalidateAfterCostCodeMutation() {
  revalidatePath("/settings/cost-codes");
  revalidatePath("/manage");
  revalidatePath("/projects", "layout");
  revalidatePath("/invoices");
  revalidatePath("/financial", "layout");
}

// Selection create/update/delete.
export function revalidateAfterSelectionMutation(projectId?: string) {
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/reports/selections");
}

// Profile update — display name lives in the header.
export function revalidateAfterProfileMutation() {
  revalidateAppHeader();
}
