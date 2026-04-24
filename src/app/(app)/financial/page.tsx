import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  Receipt,
  BookOpen,
  Landmark,
  CreditCard,
  Banknote,
  HandCoins,
  BarChart3,
  TrendingUp,
  PieChart,
  FileSpreadsheet,
  Scale,
  ArrowDownUp,
  Clock,
  ChevronRight,
  AlertTriangle,
  DollarSign,
} from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function FinancialHubPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;

  const [
    { data: invoices },
    { data: recentJournalEntries },
    { data: loans },
    { data: draws },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, status, amount, total_amount, due_date, vendor, invoice_number, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("journal_entries")
      .select("id, entry_date, reference, description, status")
      .eq("status", "posted")
      .order("entry_date", { ascending: false })
      .limit(5),
    supabase
      .from("loans")
      .select("id, loan_amount, current_balance, status")
      .eq("status", "active"),
    supabase
      .from("loan_draws")
      .select("id, status, total_amount")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const allInvoices = invoices ?? [];
  const pendingReviewInvoices = allInvoices.filter((i) => i.status === "pending_review");
  const pendingReview = pendingReviewInvoices.length;
  const pendingReviewAmount = pendingReviewInvoices.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const approvedAP = allInvoices.filter((i) => i.status === "approved");
  const outstandingAP = approvedAP.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const pastDueInvoices = allInvoices.filter(
    (i) => i.status !== "cleared" && i.status !== "void" && i.due_date && i.due_date < today
  );
  const pastDue = pastDueInvoices.length;
  const pastDueAmount = pastDueInvoices.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const releasedInvoices = allInvoices.filter((i) => i.status === "released");
  const releasedCount = releasedInvoices.length;
  const releasedAmount = releasedInvoices.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);

  const activeLoans = loans ?? [];
  const totalLoanBalance = activeLoans.reduce((s, l) => s + (l.current_balance ?? 0), 0);
  const totalLoanCommitment = activeLoans.reduce((s, l) => s + (l.loan_amount ?? 0), 0);

  const pendingDrawList = (draws ?? []).filter((d) => d.status === "draft" || d.status === "submitted");
  const pendingDraws = pendingDrawList.length;
  const pendingDrawsAmount = pendingDrawList.reduce((s, d) => s + (d.total_amount ?? 0), 0);

  const attentionCount = (pastDue > 0 ? 1 : 0) + (pendingReview > 0 ? 1 : 0) + (releasedCount > 0 ? 1 : 0) + (pendingDraws > 0 ? 1 : 0);

  const mainNavCards = [
    {
      href: "/invoices",
      icon: Receipt,
      label: "Accounts Payable",
      description: pendingReview > 0 ? `${pendingReview} pending review` : `${approvedAP.length} approved`,
      color: "text-[#4272EF]",
      bg: "bg-blue-50",
      badge: pendingReview > 0 ? `${pendingReview}` : null,
    },
    {
      href: "/financial/journal-entries",
      icon: BookOpen,
      label: "Journal Entries",
      description: `${(recentJournalEntries ?? []).length} recent`,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      badge: null,
    },
  ];

  const bankingCards = [
    { href: "/banking/accounts", icon: Landmark, label: "Bank Accounts", color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/banking/loans", icon: Banknote, label: "Loans", color: "text-[#4272EF]", bg: "bg-blue-50" },
    { href: "/banking/payments", icon: CreditCard, label: "Payment Register", color: "text-purple-600", bg: "bg-purple-50" },
    { href: "/draws", icon: HandCoins, label: "Draw Requests", color: "text-amber-600", bg: "bg-amber-50" },
  ];

  const reportCards = [
    { href: "/financial/summary", icon: PieChart, label: "Summary", color: "text-[#4272EF]", bg: "bg-blue-50" },
    { href: "/financial/income-statement", icon: TrendingUp, label: "Income Statement", color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/financial/balance-sheet", icon: Scale, label: "Balance Sheet", color: "text-indigo-600", bg: "bg-indigo-50" },
    { href: "/financial/cash-flow", icon: ArrowDownUp, label: "Cash Flow", color: "text-[#4272EF]", bg: "bg-blue-50" },
    { href: "/financial/ap-aging", icon: Clock, label: "AP Aging", color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/financial/wip", icon: BarChart3, label: "WIP Report", color: "text-purple-600", bg: "bg-purple-50" },
    { href: "/financial/vendor-spend", icon: DollarSign, label: "Vendor Spend", color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/financial/tax-export", icon: FileSpreadsheet, label: "Tax Package Export", color: "text-gray-600", bg: "bg-gray-100" },
  ];

  return (
    <>
      <Header title="Financial" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {/* ── Needs Attention hero (financial-level) ── */}
        {attentionCount > 0 && (
          <div
            className="rounded-xl px-5 py-4 mb-6 text-white"
            style={{ backgroundColor: "#0F172A" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={13} style={{ color: "var(--status-warning)" }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "var(--status-warning)" }}
              >
                Needs Attention · {attentionCount}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {pastDue > 0 && (
                <Link
                  href="/invoices"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-over)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {pastDue} past-due invoice{pastDue !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">{fmt(pastDueAmount)}</p>
                  </div>
                </Link>
              )}
              {pendingReview > 0 && (
                <Link
                  href="/invoices"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-warning)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {pendingReview} invoice{pendingReview !== 1 ? "s" : ""} to review
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">{fmt(pendingReviewAmount)}</p>
                  </div>
                </Link>
              )}
              {releasedCount > 0 && (
                <Link
                  href="/banking/payments"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-active)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {releasedCount} check{releasedCount !== 1 ? "s" : ""} outstanding
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">{fmt(releasedAmount)}</p>
                  </div>
                </Link>
              )}
              {pendingDraws > 0 && (
                <Link
                  href="/draws"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-warning)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {pendingDraws} draw{pendingDraws !== 1 ? "s" : ""} pending
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">{fmt(pendingDrawsAmount)}</p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ── Inline secondary metrics ── */}
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 pb-4 mb-6 border-b border-gray-200 tabular-nums">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AP outstanding</p>
            <p className="text-lg font-bold text-gray-900 leading-none mt-1">{fmt(outstandingAP)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pending review</p>
            <p
              className="text-lg font-bold leading-none mt-1"
              style={{ color: pendingReview > 0 ? "var(--status-warning)" : undefined }}
            >
              {pendingReview}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Past due</p>
            <p
              className="text-lg font-bold leading-none mt-1"
              style={{ color: pastDue > 0 ? "var(--status-over)" : undefined }}
            >
              {pastDue}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Loan balance</p>
            <p className="text-lg font-bold text-gray-900 leading-none mt-1">{fmt(totalLoanBalance)}</p>
            {totalLoanCommitment > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">of {fmt(totalLoanCommitment)} committed</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pending draws</p>
            <p className="text-lg font-bold text-gray-900 leading-none mt-1">{pendingDraws}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Navigation */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Nav */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Accounts</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mainNavCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group relative"
                    >
                      <div className="flex items-start justify-between">
                        <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                          <Icon size={20} className={card.color} />
                        </div>
                        {card.badge && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "var(--tint-warning)", color: "#92400E" }}
                          >
                            {card.badge}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#4272EF] transition-colors">{card.label}</p>
                      <p className="text-xs text-gray-500">{card.description}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Banking */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Banking</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {bankingCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group text-center"
                    >
                      <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mx-auto mb-2`}>
                        <Icon size={20} className={card.color} />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-[#4272EF] transition-colors">{card.label}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Reports */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Reports</h2>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {reportCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                        <Icon size={16} className={card.color} />
                      </div>
                      <span className="text-sm font-medium text-gray-700 flex-1">{card.label}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Recent Activity */}
          <div className="space-y-4">
            {/* Recent Invoices */}
            {allInvoices.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Recent Invoices</h2>
                  <Link href="/invoices" className="text-sm font-medium text-[#4272EF]">View all</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {allInvoices.slice(0, 5).map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        inv.status === "pending_review" ? "bg-amber-500" :
                        inv.status === "approved" ? "bg-blue-500" :
                        inv.status === "released" ? "bg-purple-500" :
                        inv.status === "cleared" ? "bg-emerald-500" : "bg-gray-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{inv.vendor || inv.invoice_number || "Invoice"}</p>
                        <p className="text-xs text-gray-400 capitalize">{inv.status?.replace("_", " ")}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(inv.total_amount ?? inv.amount ?? 0)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Journal Entries */}
            {(recentJournalEntries ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Recent Journal Entries</h2>
                  <Link href="/financial/journal-entries" className="text-sm font-medium text-[#4272EF]">View all</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {(recentJournalEntries ?? []).map((je) => (
                    <div key={je.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-[#4272EF]">{je.reference}</span>
                        <span className="text-xs text-gray-400">{je.entry_date}</span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">{je.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
