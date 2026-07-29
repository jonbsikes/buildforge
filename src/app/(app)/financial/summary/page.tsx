import Header from "@/components/layout/Header";
import FinancialSummaryClient, {
  type SummaryData,
  type ProjectRow,
} from "@/components/financial/FinancialSummaryClient";
import { createClient } from "@/lib/supabase/server";

// Server-first report (Package 05 §B): same RPC as the Balance Sheet, run on
// the server so the first paint carries the numbers — no client spinner.
export default async function FinancialSummaryPage() {
  const supabase = await createClient();

  const [loansRes, projectsRes, rpcRes] = await Promise.all([
    supabase.from("loans").select("project_id, current_balance, status").eq("status", "active"),
    supabase.from("projects").select("id, name").order("name"),
    (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: new Date().toISOString().split("T")[0] }),
  ]);

  type RpcRow = {
    account_number: string;
    account_name: string;
    account_type: string | null;
    account_subtype: string | null;
    total_debit: number;
    total_credit: number;
    project_id: string | null;
  };
  const rows = (rpcRes.data ?? []) as RpcRow[];

  // Aggregate by account (RPC returns per-account, per-project rows)
  const acctTotals: Record<string, { debit: number; credit: number; type: string; subtype: string }> = {};
  for (const row of rows) {
    const key = row.account_number;
    if (!acctTotals[key]) acctTotals[key] = { debit: 0, credit: 0, type: row.account_type ?? "", subtype: row.account_subtype ?? "" };
    acctTotals[key].debit += Number(row.total_debit);
    acctTotals[key].credit += Number(row.total_credit);
  }

  const getBalance = (acctNum: string) => {
    const a = acctTotals[acctNum];
    if (!a) return 0;
    if (a.type === "asset" || a.type === "expense" || a.type === "cogs") return a.debit - a.credit;
    return a.credit - a.debit;
  };

  const cash = getBalance("1000");
  const totalWIP = getBalance("1210") + getBalance("1230") + getBalance("1220");

  // Construction Loans — subtype 'loan' accounts only (number-range checks
  // wrongly caught accrued interest, customer deposits, payroll, etc.)
  let totalLoans = 0;
  for (const a of Object.values(acctTotals)) {
    if (a.type === "liability" && a.subtype === "loan") {
      totalLoans += a.credit - a.debit;
    }
  }

  // AP Outstanding from GL account 2000 (consistent with balance sheet)
  const apOutstanding = getBalance("2000");

  // Calculate total assets and equity from all accounts
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquityAccounts = 0;
  let retainedEarnings = 0;
  for (const a of Object.values(acctTotals)) {
    const balance = a.type === "asset" || a.type === "expense" || a.type === "cogs"
      ? a.debit - a.credit
      : a.credit - a.debit;
    if (a.type === "asset") totalAssets += balance;
    else if (a.type === "liability") totalLiabilities += balance;
    else if (a.type === "equity") totalEquityAccounts += balance;
    else if (a.type === "revenue") retainedEarnings += balance;
    else if (a.type === "expense" || a.type === "cogs") retainedEarnings -= balance;
  }
  const totalEquity = totalEquityAccounts + retainedEarnings;

  // WIP per project from GL (1210 + 1220 + 1230)
  const projectWIP: Record<string, number> = {};
  for (const row of rows) {
    if (!row.project_id) continue;
    if (row.account_number === "1210" || row.account_number === "1220" || row.account_number === "1230") {
      projectWIP[row.project_id] = (projectWIP[row.project_id] ?? 0) + Number(row.total_debit) - Number(row.total_credit);
    }
  }

  // Loan balance per project from loans table (loan JEs don't carry project_id)
  const projectLoans: Record<string, number> = {};
  for (const loan of loansRes.data ?? []) {
    if (loan.project_id) {
      projectLoans[loan.project_id] = (projectLoans[loan.project_id] ?? 0) + (loan.current_balance ?? 0);
    }
  }

  const projectRows: ProjectRow[] = (projectsRes.data ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      wip_balance: projectWIP[p.id] ?? 0,
      loan_balance: projectLoans[p.id] ?? 0,
    }))
    .filter((p) => Math.abs(p.wip_balance) > 0.01 || Math.abs(p.loan_balance) > 0.01);

  const data: SummaryData = {
    cash,
    totalWIP,
    totalAssets,
    totalLiabilities,
    totalLoans,
    totalEquity,
    apOutstanding,
    projectRows,
  };

  return (
    <>
      <Header title="Financial Summary" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <FinancialSummaryClient data={data} />
      </main>
    </>
  );
}
