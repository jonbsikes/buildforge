// @ts-nocheck
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

interface CashFlowLine {
  label: string;
  amount: number;
  isSubtraction?: boolean;
}

interface CashFlowSection {
  title: string;
  lines: CashFlowLine[];
  total: number;
}

export interface CashFlowData {
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<CashFlowData> {
  const supabase = await createClient();
  const start = p.start!;
  const end = p.end!;

  const { data: rawLines } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit, credit,
      account:chart_of_accounts(account_number, name, type),
      journal_entry:journal_entries(entry_date, status, source_type)
    `);

  // Filter to posted entries within date range
  const lines = (rawLines ?? []).filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date >= start &&
    l.journal_entry?.entry_date <= end
  );

  // --- OPERATING ACTIVITIES ---
  const revenueLines = lines.filter((l: any) => l.account?.type === "revenue" && Number(l.credit || 0) > 0);
  const cashFromCustomers = revenueLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const invoicePaymentLines = lines.filter((l: any) =>
    l.journal_entry?.source_type === 'invoice_payment' &&
    l.account?.account_number === '1000' &&
    Number(l.credit || 0) > 0
  );
  const cashToVendors = invoicePaymentLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const operating: CashFlowSection = {
    title: "Operating Activities",
    lines: [
      { label: "Cash received from customers", amount: cashFromCustomers },
      { label: "Cash paid to vendors & subcontractors", amount: cashToVendors, isSubtraction: true },
    ],
    total: cashFromCustomers - cashToVendors,
  };

  // --- INVESTING ACTIVITIES ---
  const wipDrawLines = lines.filter((l: any) =>
    (l.account?.account_number === '1210' || l.account?.account_number === '1230') &&
    Number(l.debit || 0) > 0
  );
  const wipFromDraws = wipDrawLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);

  const landPurchaseLines = lines.filter((l: any) =>
    l.account?.account_number === '1200' &&
    Number(l.debit || 0) > 0
  );
  const landPurchases = landPurchaseLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);

  const investing: CashFlowSection = {
    title: "Investing Activities",
    lines: [
      ...(landPurchases > 0 ? [{ label: "Land purchases", amount: landPurchases, isSubtraction: true }] : []),
      ...(wipFromDraws > 0 ? [{ label: "Construction costs capitalized to WIP", amount: wipFromDraws, isSubtraction: true }] : []),
    ],
    total: -(landPurchases + wipFromDraws),
  };

  // --- FINANCING ACTIVITIES ---
  const drawCreditLines = lines.filter((l: any) =>
    l.account?.account_number === '1000' &&
    Number(l.debit || 0) > 0 &&
    l.journal_entry?.source_type === 'loan_draw'
  );
  const cashFromDraws = drawCreditLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);

  const loanPaymentLines = lines.filter((l: any) =>
    l.account?.account_number?.startsWith('22') &&
    Number(l.debit || 0) > 0
  );
  const loanPayments = loanPaymentLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);

  const capitalContribLines = lines.filter((l: any) =>
    l.account?.type === 'equity' &&
    l.account?.account_number?.startsWith('30') &&
    Number(l.credit || 0) > 0
  );
  const capitalContribs = capitalContribLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const ownerDrawLines = lines.filter((l: any) =>
    l.account?.account_number?.startsWith('32') &&
    Number(l.debit || 0) > 0
  );
  const ownerDraws = ownerDrawLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);

  const financing: CashFlowSection = {
    title: "Financing Activities",
    lines: [
      { label: "Construction loan draws received", amount: cashFromDraws },
      ...(capitalContribs > 0 ? [{ label: "Capital contributions", amount: capitalContribs }] : []),
      ...(loanPayments > 0 ? [{ label: "Loan payments made", amount: loanPayments, isSubtraction: true }] : []),
      ...(ownerDraws > 0 ? [{ label: "Owner draws & distributions", amount: ownerDraws, isSubtraction: true }] : []),
    ],
    total: cashFromDraws + capitalContribs - loanPayments - ownerDraws,
  };

  const netChange = operating.total + investing.total + financing.total;

  return {
    operating,
    investing,
    financing,
    netChange,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function CashFlowSection({ section }: { section: CashFlowSection }) {
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <Text style={styles.sectionHeading}>{section.title}</Text>
      {section.lines.length === 0 ? (
        <Empty>No activity for this period.</Empty>
      ) : (
        section.lines.map((line, i) => (
          <View
            key={i}
            style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}] as any}
            wrap={false}
          >
            <View style={{ width: "70%" }}>
              <Text style={styles.td}>
                {line.isSubtraction && <Text>{" − "}</Text>}
                {line.label}
              </Text>
            </View>
            <View style={{ width: "30%" }}>
              <Text style={[styles.tdNum, line.isSubtraction ? { color: colors.red } : {}] as any}>
                {line.isSubtraction ? `(${fmtMoney(line.amount)})` : fmtMoney(line.amount)}
              </Text>
            </View>
          </View>
        ))
      )}
      <View style={styles.subtotalRow} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong]}>Net Cash from {section.title}</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text style={[styles.tdNumStrong, { color: section.total >= 0 ? colors.green : colors.red }] as any}>
            {section.total < 0 ? `(${fmtMoney(Math.abs(section.total))})` : fmtMoney(section.total)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function Pdf({ data, params, logo }: { data: CashFlowData; params: ReportParams; logo?: string }) {
  return (
    <ReportDocument
      title="Cash Flow Statement"
      subtitle={formatDateRange(params.start!, params.end!)}
      logo={logo}
    >
      <CashFlowSection section={data.operating} />
      <CashFlowSection section={data.investing} />
      <CashFlowSection section={data.financing} />

      <View style={[styles.totalRow, { borderTopColor: colors.brand, borderTopWidth: 2, marginTop: 12 }]} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong, { fontSize: 11 }]}>Net Change in Cash</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text
            style={[
              styles.tdNumStrong,
              { fontSize: 11, color: data.netChange >= 0 ? colors.green : colors.red },
            ] as any}
          >
            {data.netChange < 0 ? `(${fmtMoney(Math.abs(data.netChange))})` : fmtMoney(data.netChange)}
          </Text>
        </View>
      </View>
    </ReportDocument>
  );
}
