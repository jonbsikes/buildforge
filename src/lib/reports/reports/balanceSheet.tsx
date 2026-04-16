// @ts-nocheck
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
  longTermAssets: AccountBalance[];
  totalAssets: number;
  currentLiabilities: AccountBalance[];
  longTermLiabilities: AccountBalance[];
  totalLiabilities: number;
  equityAccounts: AccountBalance[];
  retainedEarnings: number;
  totalEquity: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<BalanceSheetData> {
  const supabase = await createClient();
  const asOf = p.asOf!;

  const { data: ledgerLines } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit, credit, project_id,
      account:chart_of_accounts(account_number, name, type, is_active),
      journal_entry:journal_entries(entry_date, status),
      project:projects(id, name)
    `);

  // Filter to posted entries as of date
  const posted = (ledgerLines ?? []).filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date <= asOf &&
    l.account?.is_active !== false
  );

  // Accounts that get per-project breakdown
  const WIP_CIP_ACCOUNTS = new Set(["1210", "1230"]);

  // Aggregate by account
  const acctMap: Record<string, { account_number: string; name: string; type: string; debit: number; credit: number }> = {};
  // Per-project breakdown for WIP/CIP
  const projectMap: Record<string, Record<string, { project_id: string; project_name: string; debit: number; credit: number }>> = {};

  for (const line of posted) {
    const acc = line.account as any;
    if (!acc || !["asset", "liability", "equity"].includes(acc.type)) continue;
    const key = acc.account_number;
    if (!acctMap[key]) {
      acctMap[key] = { account_number: acc.account_number, name: acc.name, type: acc.type, debit: 0, credit: 0 };
    }
    acctMap[key].debit += Number(line.debit ?? 0);
    acctMap[key].credit += Number(line.credit ?? 0);

    // Track per-project for WIP/CIP
    if (WIP_CIP_ACCOUNTS.has(key) && (line as any).project_id) {
      if (!projectMap[key]) projectMap[key] = {};
      const pid = (line as any).project_id;
      if (!projectMap[key][pid]) {
        const proj = (line as any).project;
        projectMap[key][pid] = {
          project_id: pid,
          project_name: proj?.name ?? "Unknown Project",
          debit: 0,
          credit: 0,
        };
      }
      projectMap[key][pid].debit += Number(line.debit ?? 0);
      projectMap[key][pid].credit += Number(line.credit ?? 0);
    }
  }

  // Compute normal balances
  const accounts = Object.values(acctMap).map((a) => {
    const balance = a.type === "asset" ? a.debit - a.credit : a.credit - a.debit;
    const result: AccountBalance = {
      account_number: a.account_number,
      name: a.name,
      type: a.type,
      balance,
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

  const currentAssets = accounts.filter(a => a.type === "asset" && a.account_number < "1200").sort((a, b) => a.account_number.localeCompare(b.account_number));
  const longTermAssets = accounts.filter(a => a.type === "asset" && a.account_number >= "1200").sort((a, b) => a.account_number.localeCompare(b.account_number));
  const currentLiabilities = accounts.filter(a => a.type === "liability" && a.account_number < "2100").sort((a, b) => a.account_number.localeCompare(b.account_number));
  const longTermLiabilities = accounts.filter(a => a.type === "liability" && a.account_number >= "2100").sort((a, b) => a.account_number.localeCompare(b.account_number));
  const equityAccounts = accounts.filter(a => a.type === "equity").sort((a, b) => a.account_number.localeCompare(b.account_number));

  // Compute retained earnings from P&L accounts
  const incomeLines = (ledgerLines ?? []).filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date <= asOf &&
    l.account?.is_active !== false
  );

  let revenue = 0, cogs = 0, expenses = 0;
  for (const line of incomeLines) {
    const acc = line.account as any;
    if (!acc) continue;
    const balance = acc.type === "revenue" ? (Number(line.credit ?? 0) - Number(line.debit ?? 0)) :
                    (acc.type === "cogs" || acc.type === "expense") ? (Number(line.debit ?? 0) - Number(line.credit ?? 0)) : 0;
    if (acc.type === "revenue") revenue += balance;
    else if (acc.type === "cogs") cogs += balance;
    else if (acc.type === "expense") expenses += balance;
  }

  const retainedEarnings = revenue - cogs - expenses;

  const totalAssets = [...currentAssets, ...longTermAssets].reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = [...currentLiabilities, ...longTermLiabilities].reduce((s, a) => s + a.balance, 0);
  const totalEquity = equityAccounts.reduce((s, a) => s + a.balance, 0) + retainedEarnings;

  return {
    currentAssets,
    longTermAssets,
    totalAssets,
    currentLiabilities,
    longTermLiabilities,
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
            style={[styles.tr, rowIdx++ % 2 === 1 ? styles.trZebra : {}] as any}
            wrap={false}
          >
            <View style={{ width: "70%" }}>
              <Text style={hasBreakdown ? styles.tdStrong : styles.td}>
                {l.account_number} · {l.name}
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
                style={[styles.tr, rowIdx++ % 2 === 1 ? styles.trZebra : {}] as any}
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

          {data.longTermAssets.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 8 }]}>Long-Term Assets</Text>
              <AccountRows lines={data.longTermAssets} />
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

          {data.longTermLiabilities.length > 0 && (
            <>
              <Text style={[styles.subHeading, { marginTop: 8 }]}>Long-Term Liabilities</Text>
              <AccountRows lines={data.longTermLiabilities} />
            </>
          )}

          <Subtotal label="Total Liabilities" value={data.totalLiabilities} />

          <>
            <Text style={[styles.subHeading, { marginTop: 8 }]}>Equity</Text>
            <AccountRows lines={data.equityAccounts} />
            {Math.abs(data.retainedEarnings) > 0.01 && (
              <View style={[styles.tr]} wrap={false}>
                <View style={{ width: "70%" }}>
                  <Text style={styles.td}>Retained Earnings</Text>
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
