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

  // Fetch ALL journal entry lines with JE id for grouping (paginate past Supabase 1000-row default)
  let allLines: any[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit, credit,
        account:chart_of_accounts(account_number, name, type),
        journal_entry:journal_entries(id, entry_date, status, source_type)
      `)
      .range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allLines = allLines.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // ─── CASH-BASIS APPROACH ─────────────────────────────────────────
  // Build from actual Cash (1000) movements. Group lines by JE and
  // inspect sibling accounts to categorize — works for all JEs
  // including migrated/historical entries regardless of source_type.
  // ─────────────────────────────────────────────────────────────────

  const filteredLines = allLines.filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date >= start &&
    l.journal_entry?.entry_date <= end
  );

  const jeGroupsPdf = new Map<string, any[]>();
  for (const line of filteredLines) {
    const jeId = line.journal_entry?.id;
    if (!jeId) continue;
    if (!jeGroupsPdf.has(jeId)) jeGroupsPdf.set(jeId, []);
    jeGroupsPdf.get(jeId)!.push(line);
  }

  // Category buckets
  const operatingInLines: any[] = [];
  const operatingOutLines: any[] = [];
  const drawInLines: any[] = [];
  const capitalInLines: any[] = [];
  const loanPayOutLines: any[] = [];
  const ownerDrawOutLines: any[] = [];

  for (const [, jeLines] of jeGroupsPdf) {
    const cashLines = jeLines.filter((l: any) => l.account?.account_number === '1000');
    if (cashLines.length === 0) continue;

    const siblings = jeLines.filter((l: any) => l.account?.account_number !== '1000');
    const siblingAccts = siblings.map((l: any) => l.account?.account_number ?? '');
    const siblingTypes = siblings.map((l: any) => l.account?.type ?? '');

    const hasLoanPayable = siblingAccts.some((a: string) => a.startsWith('22') || a === '2100');
    const hasDueFromLender = siblingAccts.some((a: string) => a === '1120');
    const hasEquity = siblingAccts.some((a: string) => a.startsWith('30')) || siblingTypes.includes('equity');
    const hasDistributions = siblingAccts.some((a: string) => a.startsWith('32'));

    for (const cashLine of cashLines) {
      const debit = Number(cashLine.debit || 0);
      const credit = Number(cashLine.credit || 0);

      if (debit > 0) {
        if (hasDueFromLender || hasLoanPayable) {
          drawInLines.push(cashLine);
        } else if (hasEquity) {
          capitalInLines.push(cashLine);
        } else {
          operatingInLines.push(cashLine);
        }
      }

      if (credit > 0) {
        if (hasLoanPayable) {
          loanPayOutLines.push(cashLine);
        } else if (hasDistributions) {
          ownerDrawOutLines.push(cashLine);
        } else {
          operatingOutLines.push(cashLine);
        }
      }
    }
  }

  const sumDebit = (arr: any[]) => arr.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const sumCredit = (arr: any[]) => arr.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const cashFromCustomers = sumDebit(operatingInLines);
  const cashToVendors = sumCredit(operatingOutLines);
  const cashFromDraws = sumDebit(drawInLines);
  const capitalContribs = sumDebit(capitalInLines);
  const loanPayments = sumCredit(loanPayOutLines);
  const ownerDraws = sumCredit(ownerDrawOutLines);

  const operating: CashFlowSection = {
    title: "Operating Activities",
    lines: [
      { label: "Cash received from customers", amount: cashFromCustomers },
      ...(cashToVendors > 0 ? [{ label: "Cash paid to vendors & subcontractors", amount: cashToVendors, isSubtraction: true }] : []),
    ],
    total: cashFromCustomers - cashToVendors,
  };

  const investing: CashFlowSection = {
    title: "Investing Activities",
    lines: [],
    total: 0,
  };

  const financing: CashFlowSection = {
    title: "Financing Activities",
    lines: [
      ...(cashFromDraws > 0 ? [{ label: "Construction loan draws received", amount: cashFromDraws }] : []),
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

export function Pdf({ data, params, logo }: { data: CashFlowData; params: ReportParams; logo?: Buffer | string }) {
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
