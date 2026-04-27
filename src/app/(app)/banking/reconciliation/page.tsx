import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ReconciliationClient from "@/components/banking/ReconciliationClient";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";


export default async function ReconciliationPage() {
  const supabase = await createClient();

  // Fetch active bank accounts
  const { data: accountsRaw } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, account_name, account_last_four")
    .eq("is_active", true)
    .order("bank_name");

  const accounts = accountsRaw ?? [];
  const firstAccountId = accounts[0]?.id ?? null;

  // Fetch transactions and summary for the first account
  let transactions: any[] = [];
  let summary = { total: 0, matched: 0, unmatched: 0, ignored: 0 };

  if (firstAccountId) {
    const { data: txns } = await supabase
      .from("bank_transactions")
      .select(`
        id, bank_account_id, transaction_date, description, check_ref,
        debit, credit, balance, match_status, matched_invoice_id,
        matched_journal_entry_id, category, notes, created_at
      `)
      .eq("bank_account_id", firstAccountId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    transactions = (txns ?? []).map((t: any) => ({
      ...t,
      debit: t.debit ?? 0,
      credit: t.credit ?? 0,
      matched_invoice: null,
    }));

    // Fetch matched invoice details
    const invoiceIds = transactions
      .filter((t: any) => t.matched_invoice_id)
      .map((t: any) => t.matched_invoice_id);

    if (invoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, vendor, invoice_number, amount, status")
        .in("id", invoiceIds);

      if (invoices) {
        const invMap = new Map(invoices.map((i) => [i.id, i]));
        transactions = transactions.map((t: any) => ({
          ...t,
          matched_invoice: t.matched_invoice_id ? invMap.get(t.matched_invoice_id) ?? null : null,
        }));
      }
    }

    summary = {
      total: transactions.length,
      matched: transactions.filter((t: any) => t.match_status === "matched").length,
      unmatched: transactions.filter((t: any) => t.match_status === "unmatched").length,
      ignored: transactions.filter((t: any) => t.match_status === "ignored").length,
    };
  }

  return (
    <>
      <Header title="Bank Reconciliation" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <ReadOnlyBanner />
          {accounts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">
                No bank accounts found. Add a bank account first, then import transactions.
              </p>
            </div>
          ) : (
            <ReconciliationClient
              accounts={accounts}
              initialAccountId={firstAccountId}
              initialTransactions={transactions}
              initialSummary={summary}
            />
          )}
        </div>
      </main>
    </>
  );
}
