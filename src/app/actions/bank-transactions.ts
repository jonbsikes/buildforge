"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedBankTransaction {
  transaction_date: string; // YYYY-MM-DD
  description: string;
  check_ref: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  category: string;
  import_hash: string;
}

export interface ImportResult {
  error?: string;
  imported: number;
  skipped: number;
  matched: number;
  transactions?: BankTransactionRow[];
}

export interface BankTransactionRow {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  check_ref: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  match_status: string;
  matched_invoice_id: string | null;
  matched_journal_entry_id: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  // Joined data for display
  matched_invoice?: {
    id: string;
    vendor: string | null;
    invoice_number: string | null;
    amount: number;
    status: string;
  } | null;
}

// ---------------------------------------------------------------------------
// CSV Parsing — tailored to the bank's export format
// ---------------------------------------------------------------------------

function parseDate(dateStr: string): string {
  // Bank format: M/D/YYYY → YYYY-MM-DD
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return dateStr;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAmount(val: string): number {
  if (!val || !val.trim()) return 0;
  return parseFloat(val.replace(/[,$]/g, "")) || 0;
}

function categorize(description: string, checkRef: string | null): string {
  if (checkRef && /^\d+$/.test(checkRef)) return "check";
  const d = description.toUpperCase();
  if (d.includes("LOAN ADVANCE")) return "loan_advance";
  if (d.includes("PAYMENT TO CONSTRUCTION LOAN") || d.includes("PAYMENT TO REAL ESTATE LOAN") || d.includes("PAYMENT TO LAND")) return "interest_payment";
  if (d.includes("PAYMENT TO LOAN")) return "interest_payment";
  if (d.includes("WIRE") || d.includes("OUTGOING WIRE")) return "wire";
  if (d.includes("ACH") || d.includes("PAYMENT") || d.includes("SALE")) return "ach_payment";
  return "other";
}

function hashRow(date: string, debit: number, credit: number, description: string): string {
  const raw = `${date}|${debit}|${credit}|${description}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function parseBankCSV(csvText: string): {
  error?: string;
  rows?: ParsedBankTransaction[];
} {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: "CSV file is empty or has no data rows" };

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h === "date");
  const descIdx = header.findIndex((h) => h === "description");
  const debitIdx = header.findIndex((h) => h === "debit");
  const creditIdx = header.findIndex((h) => h === "credit");
  const balanceIdx = header.findIndex((h) => h === "balance");
  const chkIdx = header.findIndex((h) => h === "chkref" || h === "check" || h === "ref");

  if (dateIdx === -1 || descIdx === -1) {
    return { error: "CSV must have Date and Description columns" };
  }

  const rows: ParsedBankTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV split (handles basic commas; bank CSVs typically don't quote)
    const cols = line.split(",");
    const dateRaw = cols[dateIdx]?.trim();
    const desc = cols[descIdx]?.trim();
    if (!dateRaw || !desc) continue;

    const debit = debitIdx >= 0 ? parseAmount(cols[debitIdx]) : 0;
    const credit = creditIdx >= 0 ? parseAmount(cols[creditIdx]) : 0;
    const balance = balanceIdx >= 0 ? parseAmount(cols[balanceIdx]) : null;
    const checkRef = chkIdx >= 0 && cols[chkIdx]?.trim() ? cols[chkIdx].trim() : null;
    const txDate = parseDate(dateRaw);

    rows.push({
      transaction_date: txDate,
      description: desc,
      check_ref: checkRef,
      debit,
      credit,
      balance: balance === 0 && balanceIdx === -1 ? null : balance,
      category: categorize(desc, checkRef),
      import_hash: hashRow(txDate, debit, credit, desc),
    });
  }

  if (rows.length === 0) return { error: "No valid transactions found in CSV" };
  return { rows };
}

// ---------------------------------------------------------------------------
// Import transactions into the database
// ---------------------------------------------------------------------------

export async function importBankTransactions(
  bankAccountId: string,
  csvText: string
): Promise<ImportResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error, imported: 0, skipped: 0, matched: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", imported: 0, skipped: 0, matched: 0 };

  // Parse CSV
  const parsed = parseBankCSV(csvText);
  if (parsed.error || !parsed.rows) {
    return { error: parsed.error, imported: 0, skipped: 0, matched: 0 };
  }

  // Check which hashes already exist (duplicate prevention)
  const hashes = parsed.rows.map((r) => r.import_hash);
  const { data: existing } = await supabase
    .from("bank_transactions")
    .select("import_hash")
    .eq("bank_account_id", bankAccountId)
    .in("import_hash", hashes);

  const existingHashes = new Set((existing ?? []).map((e) => e.import_hash));

  // Filter out duplicates
  const newRows = parsed.rows.filter((r) => !existingHashes.has(r.import_hash));
  const skipped = parsed.rows.length - newRows.length;

  if (newRows.length === 0) {
    return { error: undefined, imported: 0, skipped, matched: 0 };
  }

  // Insert new transactions
  const insertPayload = newRows.map((r) => ({
    bank_account_id: bankAccountId,
    transaction_date: r.transaction_date,
    description: r.description,
    check_ref: r.check_ref,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
    category: r.category,
    import_hash: r.import_hash,
    match_status: "unmatched",
  }));

  const { error: insertErr } = await supabase
    .from("bank_transactions")
    .insert(insertPayload);

  if (insertErr) {
    return { error: insertErr.message, imported: 0, skipped, matched: 0 };
  }

  // Now run auto-matching
  const matchResult = await autoMatchTransactions(bankAccountId);

  revalidatePath("/banking/accounts");
  revalidatePath("/banking/reconciliation");

  return {
    imported: newRows.length,
    skipped,
    matched: matchResult.matched,
  };
}

// ---------------------------------------------------------------------------
// Auto-matching logic
// ---------------------------------------------------------------------------

async function autoMatchTransactions(bankAccountId: string): Promise<{ matched: number }> {
  const supabase = await createClient();
  let matched = 0;

  // Fetch all unmatched transactions for this account
  const { data: unmatchedRaw } = await supabase
    .from("bank_transactions")
    .select("id, transaction_date, description, check_ref, debit, credit, category")
    .eq("bank_account_id", bankAccountId)
    .eq("match_status", "unmatched")
    .order("transaction_date", { ascending: false });

  if (!unmatchedRaw || unmatchedRaw.length === 0) return { matched: 0 };
  const unmatched = unmatchedRaw.map((t) => ({ ...t, debit: t.debit ?? 0, credit: t.credit ?? 0 }));

  // ---- Match checks to released invoices ----
  const checkTxns = unmatched.filter((t) => t.category === "check" && t.check_ref);
  if (checkTxns.length > 0) {
    const checkNums = checkTxns.map((t) => t.check_ref!);

    // Look in vendor_payments for check numbers
    const { data: vpMatches } = await supabase
      .from("vendor_payments")
      .select("id, check_number, amount, vendor_payment_invoices(invoice_id)")
      .in("check_number", checkNums);

    if (vpMatches) {
      for (const txn of checkTxns) {
        const vp = vpMatches.find(
          (v) => v.check_number === txn.check_ref && Math.abs(v.amount - txn.debit) < 0.01
        );
        if (vp) {
          const invoiceIds = (vp.vendor_payment_invoices as { invoice_id: string }[])?.map(
            (vi) => vi.invoice_id
          );
          const invoiceId = invoiceIds?.[0] ?? null;

          await supabase
            .from("bank_transactions")
            .update({
              match_status: "matched",
              matched_invoice_id: invoiceId,
              notes: `Auto-matched to vendor payment (check #${txn.check_ref})`,
            })
            .eq("id", txn.id);
          matched++;
        }
      }
    }

    // Also try matching directly against invoices that have check_number set
    const stillUnmatched = checkTxns.filter(
      (t) => !vpMatches?.some((v) => v.check_number === t.check_ref && Math.abs(v.amount - t.debit) < 0.01)
    );

    if (stillUnmatched.length > 0) {
      const stillCheckNums = stillUnmatched.map((t) => t.check_ref!);
      const { data: invoiceMatches } = await supabase
        .from("invoices")
        .select("id, check_number, amount, total_amount, status")
        .in("check_number", stillCheckNums)
        .in("status", ["released", "cleared"]);

      if (invoiceMatches) {
        for (const txn of stillUnmatched) {
          const inv = invoiceMatches.find((i) => {
            const amt = (i.total_amount ?? i.amount ?? 0) as number;
            return i.check_number === txn.check_ref && Math.abs(amt - txn.debit) < 0.01;
          });
          if (inv) {
            await supabase
              .from("bank_transactions")
              .update({
                match_status: "matched",
                matched_invoice_id: inv.id,
                notes: `Auto-matched to invoice (check #${txn.check_ref})`,
              })
              .eq("id", txn.id);
            matched++;
          }
        }
      }
    }
  }

  // ---- Match loan advances to funded draws ----
  const loanAdvances = unmatched.filter((t) => t.category === "loan_advance");
  if (loanAdvances.length > 0) {
    // Extract loan note numbers from descriptions
    for (const txn of loanAdvances) {
      const noteMatch = txn.description.match(/Note#?\s*(\d+)/i);
      if (!noteMatch) continue;
      const noteNum = noteMatch[1];

      // Find the loan by loan_number
      const { data: loan } = await supabase
        .from("loans")
        .select("id, loan_number")
        .eq("loan_number", noteNum)
        .maybeSingle();

      if (loan) {
        // Try to match to a specific funded draw by amount + date proximity
        const { data: draws } = await supabase
          .from("loan_draws")
          .select("id, amount_approved, funded_date")
          .eq("loan_id", loan.id)
          .eq("status", "funded");

        // Find JE for the draw funding
        const { data: jes } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("source_type", "draw_funded")
          .eq("loan_id", loan.id)
          .gte("entry_date", txn.transaction_date)
          .lte("entry_date", txn.transaction_date);

        const jeId = jes?.[0]?.id ?? null;

        await supabase
          .from("bank_transactions")
          .update({
            match_status: "matched",
            matched_journal_entry_id: jeId,
            notes: `Auto-matched to loan ${noteNum} advance`,
          })
          .eq("id", txn.id);
        matched++;
      }
    }
  }

  // ---- Match interest payments ----
  const interestPayments = unmatched.filter((t) => t.category === "interest_payment");
  if (interestPayments.length > 0) {
    for (const txn of interestPayments) {
      // Extract loan number from description
      const loanMatch = txn.description.match(/(?:XXXXXX|LN#|Note#?)(\d+)/i);
      if (!loanMatch) continue;
      const loanRef = loanMatch[1];

      // Find loan by partial loan_number match
      const { data: loans } = await supabase
        .from("loans")
        .select("id, loan_number")
        .ilike("loan_number", `%${loanRef}`);

      if (loans && loans.length > 0) {
        // Find matching JE (interest accrual) near this date
        const { data: jes } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("loan_id", loans[0].id)
          .eq("source_type", "manual")
          .gte("entry_date", txn.transaction_date)
          .lte("entry_date", txn.transaction_date);

        await supabase
          .from("bank_transactions")
          .update({
            match_status: "matched",
            matched_journal_entry_id: jes?.[0]?.id ?? null,
            notes: `Auto-matched to loan interest payment (${loanRef})`,
          })
          .eq("id", txn.id);
        matched++;
      }
    }
  }

  return { matched };
}

// ---------------------------------------------------------------------------
// Fetch transactions for reconciliation view
// ---------------------------------------------------------------------------

export async function getBankTransactions(
  bankAccountId: string,
  filters?: { matchStatus?: string; category?: string; dateFrom?: string; dateTo?: string }
): Promise<{ error?: string; transactions: BankTransactionRow[] }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error, transactions: [] };

  const supabase = await createClient();

  let query = supabase
    .from("bank_transactions")
    .select(`
      id, bank_account_id, transaction_date, description, check_ref,
      debit, credit, balance, match_status, matched_invoice_id,
      matched_journal_entry_id, category, notes, created_at
    `)
    .eq("bank_account_id", bankAccountId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.matchStatus) {
    query = query.eq("match_status", filters.matchStatus);
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.dateFrom) {
    query = query.gte("transaction_date", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("transaction_date", filters.dateTo);
  }

  const { data, error } = await query;
  if (error) return { error: error.message, transactions: [] };

  // Fetch matched invoice details
  const invoiceIds = (data ?? [])
    .filter((t) => t.matched_invoice_id)
    .map((t) => t.matched_invoice_id!);

  let invoiceMap = new Map<string, { id: string; vendor: string | null; invoice_number: string | null; amount: number; status: string }>();
  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, vendor, invoice_number, amount, status")
      .in("id", invoiceIds);

    if (invoices) {
      for (const inv of invoices) {
        invoiceMap.set(inv.id, { ...inv, amount: inv.amount ?? 0 });
      }
    }
  }

  const transactions: BankTransactionRow[] = (data ?? []).map((t) => ({
    ...t,
    debit: t.debit ?? 0,
    credit: t.credit ?? 0,
    created_at: t.created_at ?? "",
    matched_invoice: t.matched_invoice_id ? invoiceMap.get(t.matched_invoice_id) ?? null : null,
  }));

  return { transactions };
}

// ---------------------------------------------------------------------------
// Manual match / unmatch / ignore
// ---------------------------------------------------------------------------

export async function matchTransaction(
  transactionId: string,
  invoiceId: string | null,
  journalEntryId: string | null
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("bank_transactions")
    .update({
      match_status: "matched",
      matched_invoice_id: invoiceId,
      matched_journal_entry_id: journalEntryId,
    })
    .eq("id", transactionId);

  if (error) return { error: error.message };
  revalidatePath("/banking/reconciliation");
  return {};
}

export async function unmatchTransaction(transactionId: string): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("bank_transactions")
    .update({
      match_status: "unmatched",
      matched_invoice_id: null,
      matched_journal_entry_id: null,
      notes: null,
    })
    .eq("id", transactionId);

  if (error) return { error: error.message };
  revalidatePath("/banking/reconciliation");
  return {};
}

export async function ignoreTransaction(transactionId: string, notes?: string): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("bank_transactions")
    .update({
      match_status: "ignored",
      notes: notes || "Manually ignored",
    })
    .eq("id", transactionId);

  if (error) return { error: error.message };
  revalidatePath("/banking/reconciliation");
  return {};
}

// ---------------------------------------------------------------------------
// Get reconciliation summary counts
// ---------------------------------------------------------------------------

export async function getReconciliationSummary(
  bankAccountId: string
): Promise<{
  error?: string;
  total: number;
  matched: number;
  unmatched: number;
  ignored: number;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bank_transactions")
    .select("match_status")
    .eq("bank_account_id", bankAccountId);

  if (error) return { error: error.message, total: 0, matched: 0, unmatched: 0, ignored: 0 };

  const rows = data ?? [];
  return {
    total: rows.length,
    matched: rows.filter((r) => r.match_status === "matched").length,
    unmatched: rows.filter((r) => r.match_status === "unmatched").length,
    ignored: rows.filter((r) => r.match_status === "ignored").length,
  };
}
