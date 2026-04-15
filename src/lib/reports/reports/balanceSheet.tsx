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
      debit, credit,
      account:chart_of_accounts(account_number, name, type, is_active),
      journal_entry:journal_entries(entry_date, status)
    `);

  // Filter to posted entries as of date
  const posted = (ledgerLines ?? []).filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date <= asOf &&
    l.account?.is_active !== false
  );

  // Aggregate by account
  const acctMap: Record<string, { account_number: string; name: string; type: string; debit: number; credit: number }> = {};
  for (const line of posted) {
    const acc = line.account as any;
    if (!acc || !["asset", "liability", "equity"].includes(acc.type)) continue;
    const key = acc.account_number;
    if (!acctMap[key]) {
      acctMap[key] = { account_number: acc.account_number, name: acc.name, type: acc.type, debit: 0, credit: 0 };
    }
    acctMap[key].debit += Number(line.debit ?? 0);
    acctMap[key].credit += Number(line.credit ?? 0);
  }

  // Compute normal balances
  const accounts = Object.values(acctMap).map((a) => ({
    account_number: a.account_number,
    name: a.name,
    type: a.type,
    balance: a.type === "asset" ? a.debit - a.credit : a.credit - a.debit,
  }));

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
  return (
    <View>
      {lines.map((l, i) => (
        <View
          key={l.account_number}
          style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}] as any}
          wrap={false}
        >
          <View style={{ width: "70%" }}>
            <Text style={styles.td}>{l.account_number} · {l.name}</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={styles.tdNum}>{fmtMoney(l.balance)}</Text>
          </View>
        </View>
      ))}
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
