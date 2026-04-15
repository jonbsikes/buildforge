import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  formatDateRange,
  SectionHeading,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountLine {
  account_number: string;
  account: string;
  total: number;
}

export interface IncomeStatementData {
  revenue: AccountLine[];
  cogs: AccountLine[];
  expenses: AccountLine[];
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<IncomeStatementData> {
  const supabase = await createClient();
  const start = p.start!;
  const end = p.end!;

  const { data: ledgerLines } = await supabase
    .from("journal_entry_lines")
    .select(`
      id, debit, credit, description,
      account:chart_of_accounts(account_number, name, type),
      journal_entry:journal_entries(entry_date, status)
    `);

  const posted = (ledgerLines ?? []).filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date >= start &&
    l.journal_entry?.entry_date <= end
  );

  const byAccount: Record<string, { account_number: string; name: string; type: string; debit: number; credit: number }> = {};
  for (const line of posted) {
    const acc = line.account as any;
    if (!acc || !["revenue", "cogs", "expense"].includes(acc.type)) continue;
    const key = acc.account_number;
    if (!byAccount[key]) {
      byAccount[key] = { account_number: acc.account_number, name: acc.name, type: acc.type, debit: 0, credit: 0 };
    }
    byAccount[key].debit += Number(line.debit ?? 0);
    byAccount[key].credit += Number(line.credit ?? 0);
  }

  const toLines = (type: string): AccountLine[] =>
    Object.values(byAccount)
      .filter((a) => a.type === type)
      .map((a) => ({
        account_number: a.account_number,
        account: `${a.account_number} · ${a.name}`,
        total: type === "revenue" ? a.credit - a.debit : a.debit - a.credit,
      }))
      .filter((a) => Math.abs(a.total) > 0.01)
      .sort((a, b) => a.account_number.localeCompare(b.account_number));

  const revenue = toLines("revenue");
  const cogs = toLines("cogs");
  const expenses = toLines("expense");
  const totalRevenue = revenue.reduce((s, l) => s + l.total, 0);
  const totalCOGS = cogs.reduce((s, l) => s + l.total, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.total, 0);
  const grossProfit = totalRevenue - totalCOGS;

  return {
    revenue, cogs, expenses,
    totalRevenue, totalCOGS, grossProfit, totalExpenses,
    netIncome: grossProfit - totalExpenses,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function AccountRows({ lines }: { lines: AccountLine[] }) {
  if (lines.length === 0) return <Empty>No entries for this period.</Empty>;
  return (
    <View>
      {lines.map((l, i) => (
        <View
          key={l.account_number}
          style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}] as any}
          wrap={false}
        >
          <View style={{ width: "70%" }}>
            <Text style={styles.td}>{l.account}</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={styles.tdNum}>{fmtMoney(l.total)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Subtotal({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" | "brand" }) {
  const toneStyle =
    tone === "green" ? { color: colors.green } :
    tone === "red" ? { color: colors.red } :
    tone === "brand" ? { color: colors.brand } : {};
  return (
    <View style={styles.subtotalRow} wrap={false}>
      <View style={{ width: "70%" }}>
        <Text style={[styles.tdStrong]}>{label}</Text>
      </View>
      <View style={{ width: "30%" }}>
        <Text style={[styles.tdNumStrong, toneStyle] as any}>{fmtMoney(value)}</Text>
      </View>
    </View>
  );
}

export function Pdf({ data, params, logo }: { data: IncomeStatementData; params: ReportParams; logo?: Buffer | string }) {
  return (
    <ReportDocument
      title="Income Statement"
      subtitle={formatDateRange(params.start!, params.end!)}
      logo={logo}
    >
      <SectionHeading>Revenue</SectionHeading>
      <AccountRows lines={data.revenue} />
      <Subtotal label="Total Revenue" value={data.totalRevenue} tone="green" />

      <SectionHeading>Cost of Goods Sold</SectionHeading>
      <AccountRows lines={data.cogs} />
      <Subtotal label="Total COGS" value={data.totalCOGS} tone="red" />

      <View style={[styles.totalRow, { borderTopColor: colors.brand, borderTopWidth: 1 }]} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong, { fontSize: 10 }]}>Gross Profit</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text
            style={[
              styles.tdNumStrong,
              { fontSize: 10, color: data.grossProfit >= 0 ? colors.green : colors.red },
            ] as any}
          >
            {fmtMoney(data.grossProfit)}
          </Text>
        </View>
      </View>

      <SectionHeading>Operating Expenses</SectionHeading>
      <AccountRows lines={data.expenses} />
      <Subtotal label="Total Operating Expenses" value={data.totalExpenses} tone="red" />

      <View style={[styles.totalRow] as any} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong, { fontSize: 11 }]}>Net Income</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text
            style={[
              styles.tdNumStrong,
              { fontSize: 11, color: data.netIncome >= 0 ? colors.green : colors.red },
            ] as any}
          >
            {fmtMoney(data.netIncome)}
          </Text>
        </View>
      </View>
    </ReportDocument>
  );
}
