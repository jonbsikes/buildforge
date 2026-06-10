import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  formatAsOf,
  SectionHeading,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountBalance {
  account_number: string;
  name: string;
  type: string;
  balance: number;
  projectBreakdown?: ProjectBalance[];
}

interface ProjectBalance {
  project_id: string;
  project_name: string;
  balance: number;
}

export interface BalanceSheetData {
  currentAssets: AccountBalance[];
  /** WIP / CIP / capitalized interest / land — inventory-type assets for a homebuilder */
  inventoryAssets: AccountBalance[];
  otherAssets: AccountBalance[];
  totalAssets: number;
  currentLiabilities: AccountBalance[];
  loanLiabilities: AccountBalance[];
  totalLiabilities: number;
  equityAccounts: AccountBalance[];
  retainedEarnings: number;
  totalEquity: number;
}

// Inventory-type asset accounts for a homebuilder (homes built for sale are
// inventory under GAAP — not long-term/fixed assets): Land Inventory (1200),
// Construction WIP (1210), Capitalized Interest (1220), CIP — Land (1230).
const INVENTORY_ACCOUNTS = new Set(["1200", "1210", "1220", "1230"]);
// Accounts that get a per-project breakdown on the report
const WIP_CIP_ACCOUNTS = new Set(["1210", "1230"]);

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<BalanceSheetData> {
  const supabase = await createClient();
  const asOf = p.asOf!;

  // Server-side aggregation — per-account, per-project totals from posted
  // entries as of the date (same RPC as the Balance Sheet client) + available
  // vendor credits for the AP display split (matches the screen).
  type RpcRow = {
    account_number: string;
    account_name: string;
    account_type: string | null;
    account_subtype: string | null;
    total_debit: number;
    total_credit: number;
    project_id: string | null;
    project_name: string | null;
  };
  const [{ data: rpcData }, { data: openCredits }] = await Promise.all([
    (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: asOf }),
    supabase.from("vendor_credits").select("amount, applied_amount").eq("status", "available"),
  ]);
  const rows = (rpcData ?? []) as RpcRow[];
  const creditsAvailable = (openCredits ?? []).reduce(
    (s, c) => s + Math.max(0, Number(c.amount) - Number(c.applied_amount ?? 0)),
    0
  );

  // Aggregate by account (the RPC returns per-project rows, so we combine)
  const acctMap: Record<string, { account_number: string; name: string; type: string; subtype: string; debit: number; credit: number }> = {};
  // Per-project breakdown for WIP/CIP
  const projectMap: Record<string, Record<string, { project_id: string; project_name: string; debit: number; credit: number }>> = {};

  for (const row of rows) {
    const type = row.account_type ?? "";
    if (!["asset", "liability", "equity"].includes(type)) continue;
    const key = row.account_number;
    if (!acctMap[key]) {
      acctMap[key] = { account_number: key, name: row.account_name, type, subtype: row.account_subtype ?? "", debit: 0, credit: 0 };
    }
    acctMap[key].debit += Number(row.total_debit);
    acctMap[key].credit += Number(row.total_credit);

    // Track per-project for WIP/CIP
    if (WIP_CIP_ACCOUNTS.has(key) && row.project_id) {
      if (!projectMap[key]) projectMap[key] = {};
      const pid = row.project_id;
      if (!projectMap[key][pid]) {
        projectMap[key][pid] = {
          project_id: pid,
          project_name: row.project_name ?? "Unknown Project",
          debit: 0,
          credit: 0,
        };
      }
      projectMap[key][pid].debit += Number(row.total_debit);
      projectMap[key][pid].credit += Number(row.total_credit);
    }
  }

  // Compute normal balances
  const accounts = Object.values(acctMap).map((a) => {
    const balance = a.type === "asset" ? a.debit - a.credit : a.credit - a.debit;
    const result: AccountBalance & { subtype: string } = {
      account_number: a.account_number,
      name: a.name,
      type: a.type,
      balance,
      subtype: a.subtype,
    };
    // Attach per-project breakdown for WIP/CIP
    if (WIP_CIP_ACCOUNTS.has(a.account_number) && projectMap[a.account_number]) {
      result.projectBreakdown = Object.values(projectMap[a.account_number])
        .map((p) => ({
          project_id: p.project_id,
          project_name: p.project_name,
          balance: p.debit - p.credit,
        }))
        .filter((p) => Math.abs(p.balance) > 0.01)
        .sort((a, b) => b.balance - a.balance);
    }
    return result;
  });

  const nonZero = (a: AccountBalance) => Math.abs(a.balance) >= 0.005;
  const byNumber = (a: AccountBalance, b: AccountBalance) => a.account_number.localeCompare(b.account_number);

  const assetAccounts = accounts.filter((a) => a.type === "asset" && nonZero(a));
  const inventoryAssets = assetAccounts.filter((a) => INVENTORY_ACCOUNTS.has(a.account_number)).sort(byNumber);
  const fixedAssets = assetAccounts
    .filter((a) => !INVENTORY_ACCOUNTS.has(a.account_number) && a.subtype === "fixed_asset")
    .sort(byNumber);
  const currentAssets = assetAccounts
    .filter((a) => !INVENTORY_ACCOUNTS.has(a.account_number) && a.subtype !== "fixed_asset")
    .sort(byNumber);

  // Liabilities: loans (subtype 'loan') vs everything else (current).
  const liabilityAccounts = accounts.filter((a) => a.type === "liability" && nonZero(a));
  const loanLiabilities = liabilityAccounts.filter((a) => a.subtype === "loan").sort(byNumber);
  const currentLiabRaw = liabilityAccounts.filter((a) => a.subtype !== "loan").sort(byNumber);

  // Split AP (2000) into gross trade AP + "Less: Vendor Credits Available" so
  // the line reconciles to the AP invoices page. Both rows together still
  // equal the GL balance — display split only, same as the screen client.
  const currentLiabilities: AccountBalance[] = [];
  for (const a of currentLiabRaw) {
    if (a.account_number === "2000" && creditsAvailable > 0.005) {
      currentLiabilities.push({ ...a, name: "Accounts Payable - Trade", balance: a.balance + creditsAvailable });
      currentLiabilities.push({
        account_number: "2000-CR",
        name: "Less: Vendor Credits Available",
        type: "liability",
        balance: -creditsAvailable,
      });
    } else {
      currentLiabilities.push(a);
    }
  }

  const equityAccounts = accounts.filter((a) => a.type === "equity").sort(byNumber);

  // Retained earnings = accumulated net income through the as-of date
  // (all P&L activity from inception; the RPC includes all account types).
  let revenue = 0, cogs = 0, expenses = 0;
  for (const row of rows) {
    const type = row.account_type ?? "";
    if (type === "revenue") revenue += Number(row.total_credit) - Number(row.total_debit);
    else if (type === "cogs") cogs += Number(row.total_debit) - Number(row.total_credit);
    else if (type === "expense") expenses += Number(row.total_debit) - Number(row.total_credit);
  }

  const retainedEarnings = revenue - cogs - expenses;

  const totalAssets = [...currentAssets, ...inventoryAssets, ...fixedAssets].reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = [...currentLiabilities, ...loanLiabilities].reduce((s, a) => s + a.balance, 0);
  const totalEquity = equityAccounts.reduce((s, a) => s + a.balance, 0) + retainedEarnings;

  return {
    currentAssets,
    inventoryAssets,
    otherAssets: fixedAssets,
    totalAssets,
    currentLiabilities,
    loanLiabilities,
    totalLiabilities,
    equityAccounts,
    retainedEarnings,
    totalEquity,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function AccountRows({ lines }: { lines: AccountBalance[] }) {
  if (lines.length === 0) return null;
  let rowIdx = 0;
  return (
    <View>
      {lines.map((l) => {
        const hasBreakdown = l.projectBreakdown && l.projectBreakdown.length > 0;
        const mainRow = (
          <View
            key={l.account_number}
            style={[styles.tr, rowIdx++ % 2 === 1 ? styles.trZebra : {}]}
            wrap={false}
          >
            <View style={{ width: "70%" }}>
              <Text style={hasBreakdown ? styles.tdStrong : styles.td}>
                {l.account_number.endsWith("-CR") ? l.name : `${l.account_number} · ${l.name}`}
              </Text>
            </View>
            <View style={{ width: "30%" }}>
              <Text style={hasBreakdown ? styles.tdNumStrong : styles.tdNum}>
                {fmtMoney(l.balance)}
              </Text>
            </View>
          </View>
        );
        if (!hasBreakdown) return mainRow;
        return (
          <View key={l.account_number}>
            {mainRow}
            {l.projectBreakdown!.map((p) => (
              <View
                key={p.project_id}
                style={[styles.tr, rowIdx++ % 2 === 1 ? styles.trZebra : {}]}
                wrap={false}
              >
                <View style={{ width: "70%", paddingLeft: 14 }}>
                  <Text style={[styles.td, { color: colors.muted, fontSize: 8 }]}>
                    {p.project_name}
                  </Text>
                </View>
                <View style={{ width: "30%" }}>
                  <Text style={[styles.tdNum, { color: colors.muted, fontSize: 8 }]}>
                    {fmtMoney(p.balance)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Subtotal({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.subtotalRow} wrap={false}>
      <View style={{ width: "70%" }}>
        <Text style={[styles.tdStrong]}>{label}</Text>
      </View>
      <View style={{ width: "30%" }}>
        <Text style={[styles.tdNumStrong]}>{fmtMoney(value)}</Text>
      </View>
    </View>
  );
}

export function Pdf({ data, params, logo }: { data: BalanceSheetData; params: ReportParams; logo?: Buffer | string }) {
  return (
    <ReportDocument
      title="Balance Sheet"
      subtitle={formatAsOf(params.asOf!)}
      logo={logo}
    >
      <View style={{ flexDirection: "row", gap: 20 }}>
        {/* LEFT COLUMN - ASSETS */}
        <View style={{ flex: 1 }}>
          <SectionHeading>Assets</SectionHeading>

          {data.currentAssets.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 6 }]}>Current Assets</Text>
              <AccountRows lines={data.currentAssets} />
            </>
          )}

          {data.inventoryAssets.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 8 }]}>Construction Inventory (WIP & Land)</Text>
              <AccountRows lines={data.inventoryAssets} />
            </>
          )}

          {data.otherAssets.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 8 }]}>Property & Equipment</Text>
              <AccountRows lines={data.otherAssets} />
            </>
          )}

          <Subtotal label="Total Assets" value={data.totalAssets} />
        </View>

        {/* RIGHT COLUMN - LIABILITIES & EQUITY */}
        <View style={{ flex: 1 }}>
          <SectionHeading>Liabilities & Equity</SectionHeading>

          {data.currentLiabilities.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 6 }]}>Current Liabilities</Text>
              <AccountRows lines={data.currentLiabilities} />
            </>
          )}

          {data.loanLiabilities.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 8 }]}>Construction & Development Loans</Text>
              <AccountRows lines={data.loanLiabilities} />
            </>
          )}

          <Subtotal label="Total Liabilities" value={data.totalLiabilities} />

          <>
            <Text style={[styles.subHeading, { marginTop: 8 }]}>Equity</Text>
            <AccountRows lines={data.equityAccounts} />
            {Math.abs(data.retainedEarnings) > 0.01 && (
              <View style={[styles.tr]} wrap={false}>
                <View style={{ width: "70%" }}>
                  <Text style={styles.td}>Retained Earnings (Net Income to Date)</Text>
                </View>
                <View style={{ width: "30%" }}>
                  <Text style={styles.tdNum}>{fmtMoney(data.retainedEarnings)}</Text>
                </View>
              </View>
            )}
          </>

          <Subtotal label="Total Equity" value={data.totalEquity} />

          <View style={[styles.totalRow, { borderTopColor: colors.brand, borderTopWidth: 1, marginTop: 8 }]} wrap={false}>
            <View style={{ width: "70%" }}>
              <Text style={[styles.tdStrong, { fontSize: 10 }]}>Total Liabilities + Equity</Text>
            </View>
            <View style={{ width: "30%" }}>
              <Text style={[styles.tdNumStrong, { fontSize: 10 }]}>{fmtMoney(data.totalLiabilities + data.totalEquity)}</Text>
            </View>
          </View>
        </View>
      </View>
    </ReportDocument>
  );
}
