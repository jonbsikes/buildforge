import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";
import BankAccountDetailClient from "@/components/banking/BankAccountDetailClient";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";


interface Props {
  params: Promise<{ id: string }>;
}

export default async function BankAccountDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [accountResult, txnResult] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("id, bank_name, account_name, account_last_four, account_type, notes")
      .eq("id", id)
      .single(),
    supabase
      .from("bank_transactions")
      .select(`
        id, bank_account_id, transaction_date, description, check_ref,
        debit, credit, balance, match_status, matched_invoice_id,
        matched_journal_entry_id, category, notes, created_at
      `)
      .eq("bank_account_id", id)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!accountResult.data) return notFound();
  const account = accountResult.data;

  const rawTxns = txnResult.data ?? [];

  // Fetch matched invoice details
  const invoiceIds = rawTxns
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

  const transactions = rawTxns.map((t) => ({
    ...t,
    debit: t.debit ?? 0,
    credit: t.credit ?? 0,
    created_at: t.created_at ?? "",
    matched_invoice: t.matched_invoice_id
      ? invoiceMap.get(t.matched_invoice_id) ?? null
      : null,
  }));

  // Summary counts
  const summary = {
    total: transactions.length,
    matched: transactions.filter((t) => t.match_status === "matched").length,
    unmatched: transactions.filter((t) => t.match_status === "unmatched").length,
    ignored: transactions.filter((t) => t.match_status === "ignored").length,
  };

  return (
    <>
      <Header title={`${account.bank_name} — ${account.account_name}`} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <Link
            href="/banking/accounts"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#4272EF] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Bank Accounts
          </Link>
          <ReadOnlyBanner />
          <BankAccountDetailClient
            account={account}
            initialTransactions={transactions}
            initialSummary={summary}
          />
        </div>
      </main>
    </>
  );
}
