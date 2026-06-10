import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  formatDateRange,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";
import {
  parseCashFlowBuckets,
  buildCashFlowStatementSections,
  type CashFlowStatementSection,
} from "../cashflow-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashFlowData {
  operating: CashFlowStatementSection;
  investing: CashFlowStatementSection;
  financing: CashFlowStatementSection;
  netChange: number;
  beginningCash: number;
  endingCash: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<CashFlowData> {
  const supabase = await createClient();
  const start = p.start!;
  const end = p.end!;

  // Direct-method statement from actual cash-account movement
  // (get_cash_flow_statement, migration 041). Buckets partition every cash
  // line exactly, so beginning + net change = ending = GL cash balance.
  const { data: bucketData } = await (supabase.rpc as any)("get_cash_flow_statement", {
    p_start: start,
    p_end: end,
  });
  const b = parseCashFlowBuckets(((bucketData ?? []) as Record<string, number | string>[])[0]);

  const { operating, investing, financing, netChange } = buildCashFlowStatementSections(b);

  return {
    operating,
    investing,
    financing,
    netChange,
    beginningCash: b.beginning_cash,
    endingCash: b.ending_cash,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function CashFlowSectionView({ section }: { section: CashFlowStatementSection }) {
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <Text style={styles.sectionHeading}>{section.title}</Text>
      {section.lines.length === 0 ? (
        <Empty>{section.note ?? "No activity for this period."}</Empty>
      ) : (
        <>
          {section.lines.map((line, i) => (
            <View
              key={line.bucket}
              style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}
              wrap={false}
            >
              <View style={{ width: "70%" }}>
                <Text style={styles.td}>
                  {line.isSubtraction && <Text>{" − "}</Text>}
                  {line.label}
                </Text>
              </View>
              <View style={{ width: "30%" }}>
                <Text style={[styles.tdNum, line.isSubtraction ? { color: colors.red } : {}]}>
                  {line.isSubtraction ? `(${fmtMoney(line.amount)})` : fmtMoney(line.amount)}
                </Text>
              </View>
            </View>
          ))}
          {section.note && (
            <Text style={[styles.small, { color: colors.muted, marginTop: 2 }]}>{section.note}</Text>
          )}
        </>
      )}
      <View style={styles.subtotalRow} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong]}>Net Cash from {section.title}</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text style={[styles.tdNumStrong, { color: section.total >= 0 ? colors.green : colors.red }]}>
            {section.total < 0 ? `(${fmtMoney(Math.abs(section.total))})` : fmtMoney(section.total)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ReconRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={[styles.tr]} wrap={false}>
      <View style={{ width: "70%" }}>
        <Text style={strong ? styles.tdStrong : styles.td}>{label}</Text>
      </View>
      <View style={{ width: "30%" }}>
        <Text style={strong ? styles.tdNumStrong : styles.tdNum}>
          {value < 0 ? `(${fmtMoney(Math.abs(value))})` : fmtMoney(value)}
        </Text>
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
      <CashFlowSectionView section={data.operating} />
      <CashFlowSectionView section={data.investing} />
      <CashFlowSectionView section={data.financing} />

      <View style={[styles.totalRow, { borderTopColor: colors.brand, borderTopWidth: 2, marginTop: 12 }]} wrap={false}>
        <View style={{ width: "70%" }}>
          <Text style={[styles.tdStrong, { fontSize: 11 }]}>Net Change in Cash</Text>
        </View>
        <View style={{ width: "30%" }}>
          <Text
            style={[
              styles.tdNumStrong,
              { fontSize: 11, color: data.netChange >= 0 ? colors.green : colors.red },
            ]}
          >
            {data.netChange < 0 ? `(${fmtMoney(Math.abs(data.netChange))})` : fmtMoney(data.netChange)}
          </Text>
        </View>
      </View>

      {/* Reconciliation to the GL cash balance */}
      <View style={{ marginTop: 10 }} wrap={false}>
        <Text style={styles.sectionHeading}>Cash Reconciliation</Text>
        <ReconRow label="Cash at beginning of period" value={data.beginningCash} />
        <ReconRow label="Net change in cash" value={data.netChange} />
        <View style={styles.subtotalRow} wrap={false}>
          <View style={{ width: "70%" }}>
            <Text style={styles.tdStrong}>Cash at end of period (ties to GL cash accounts)</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={styles.tdNumStrong}>{fmtMoney(data.endingCash)}</Text>
          </View>
        </View>
      </View>
    </ReportDocument>
  );
}
