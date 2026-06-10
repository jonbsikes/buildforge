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

  // Server-side aggregation — per-account P&L totals from posted entries.
  type RpcRow = {
    account_number: string;
    account_name: string;
    account_type: string;
    total_debit: number;
    total_credit: number;
  };
  const { data: rpcData } = await (supabase.rpc as any)("get_income_statement_data", { p_start: start, p_end: end });
  const rows = (rpcData ?? []) as RpcRow[];

  const toLines = (type: string): AccountLine[] =>
    rows
      .filter((a) => a.account_type === type)
      .map((a) => ({
        account_number: a.account_number,
        account: `${a.account_number} · ${a.account_name}`,
        total: type === "revenue"
          ? Number(a.total_credit) - Number(a.total_debit)
          : Number(a.total_debit) - Number(a.total_credit),
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
          style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}
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
        <Text style={[styles.tdNumStrong, toneStyle]}>{fmtMoney(value)}</Text>
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
            ]}
          >
            {fmtMoney(data.grossProfit)}
          </Text>
        </View>
      </View>

      <SectionHeading>Operating Expenses</SectionHeading>
      <AccountRows lines={data.expenses} />
      <Subtotal label="Total Operating Expenses" value={data.totalExpenses} tone="red" />

      <View style={[styles.totalRow]} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong, { fontSize: 11 }]}>Net Income</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text
            style={[
              styles.tdNumStrong,
              { fontSize: 11, color: data.netIncome >= 0 ? colors.green : colors.red },
            ]}
          >
            {fmtMoney(data.netIncome)}
          </Text>
        </View>
      </View>
    </ReportDocument>
  );
}
