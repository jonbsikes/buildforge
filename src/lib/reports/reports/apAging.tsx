import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  fmtDate,
  formatAsOf,
  Table,
  SectionHeading,
  Empty,
  type Column,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

interface AgingRow {
  vendor: string;
  invoice_number: string;
  project: string;
  due_date: string;
  amount: number;
  bucket: AgingBucket;
}

interface MemoRow {
  vendor: string;
  invoice_number: string;
  project: string;
  date: string;
  amount: number;
}

export interface APAgingData {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  rows: AgingRow[];
  grandTotal: number;
  /** unapplied vendor credits sitting as DR balances in AP */
  creditsAvailable: number;
  /** grandTotal − creditsAvailable — ties to GL account 2000 */
  netAP: number;
  /** invoices awaiting approval — no JE posted yet, NOT in AP */
  pendingReview: MemoRow[];
  pendingReviewTotal: number;
  /** released invoices — checks written, moved from AP (2000) to 2050 */
  outstandingChecks: MemoRow[];
  outstandingChecksTotal: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function getBucket(dueDate: string, asOf: string): AgingBucket {
  const today = new Date(asOf);
  const due = new Date(dueDate);
  const daysPastDue = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export async function getData(p: ReportParams): Promise<APAgingData> {
  const supabase = await createClient();
  const asOf = p.asOf!;

  // AP (account 2000) holds ONLY approved, unpaid invoices:
  //   pending_review → no JE posted yet (not in AP)
  //   approved       → DR WIP / CR AP posted (in AP)            ← aging rows
  //   released       → DR AP / CR 2050 posted (moved out of AP) ← memo section
  // Vendor credits post DR AP at entry, so available credits reduce net AP.
  const [{ data: invoices }, { data: openCredits }] = await Promise.all([
    supabase
      .from("invoices")
      .select("vendor, invoice_number, invoice_date, due_date, amount, status, project_id, projects(name)")
      .in("status", ["pending_review", "approved", "released"]),
    supabase
      .from("vendor_credits")
      .select("amount, applied_amount")
      .eq("status", "available")
      .lte("credit_date", asOf),
  ]);

  const creditsAvailable = (openCredits ?? []).reduce(
    (s, c) => s + Math.max(0, Number(c.amount) - Number(c.applied_amount ?? 0)),
    0
  );

  const rows: AgingRow[] = [];
  const pendingReview: MemoRow[] = [];
  const outstandingChecks: MemoRow[] = [];

  for (const inv of invoices ?? []) {
    const project = inv.projects as { name: string } | null;
    const base = {
      vendor: inv.vendor ?? "Unknown Vendor",
      invoice_number: inv.invoice_number ?? "—",
      project: project?.name ?? "No Project",
      amount: inv.amount ?? 0,
    };
    if (inv.status === "approved") {
      const dueDate = inv.due_date ?? asOf;
      rows.push({ ...base, due_date: dueDate, bucket: getBucket(dueDate, asOf) });
    } else if (inv.status === "pending_review") {
      pendingReview.push({ ...base, date: inv.invoice_date ?? "—" });
    } else if (inv.status === "released") {
      outstandingChecks.push({ ...base, date: inv.due_date ?? inv.invoice_date ?? "—" });
    }
  }

  // Calculate bucket totals
  const bucketTotals: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let grandTotal = 0;
  for (const row of rows) {
    bucketTotals[row.bucket] += row.amount;
    grandTotal += row.amount;
  }

  return {
    current: bucketTotals.current,
    days1to30: bucketTotals["1-30"],
    days31to60: bucketTotals["31-60"],
    days61to90: bucketTotals["61-90"],
    days90plus: bucketTotals["90+"],
    rows: rows.sort((a, b) => a.bucket.localeCompare(b.bucket) || b.amount - a.amount),
    grandTotal,
    creditsAvailable,
    netAP: grandTotal - creditsAvailable,
    pendingReview: pendingReview.sort((a, b) => b.amount - a.amount),
    pendingReviewTotal: pendingReview.reduce((s, r) => s + r.amount, 0),
    outstandingChecks: outstandingChecks.sort((a, b) => b.amount - a.amount),
    outstandingChecksTotal: outstandingChecks.reduce((s, r) => s + r.amount, 0),
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "1-30": "1–30 Days",
  "31-60": "31–60 Days",
  "61-90": "61–90 Days",
  "90+": "90+ Days",
};

const BUCKET_ORDER: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

const memoColumns: Column<MemoRow>[] = [
  { key: "vendor", label: "Vendor", width: 30 },
  { key: "invoice_number", label: "Invoice #", width: 20 },
  { key: "project", label: "Project", width: 25 },
  { key: "date", label: "Date", width: 12, getText: (r) => fmtDate(r.date) },
  { key: "amount", label: "Amount", width: 13, align: "right", getText: (r) => fmtMoney(r.amount) },
];

function MemoTotal({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.subtotalRow} wrap={false}>
      <View style={{ width: "87%" }}>
        <Text style={styles.tdStrong}>{label}</Text>
      </View>
      <View style={{ width: "13%" }}>
        <Text style={styles.tdNumStrong}>{fmtMoney(value)}</Text>
      </View>
    </View>
  );
}

export function Pdf({ data, params, logo }: { data: APAgingData; params: ReportParams; logo?: Buffer | string }) {
  const columns: Column<AgingRow>[] = [
    { key: "vendor", label: "Vendor", width: 20 },
    { key: "invoice_number", label: "Invoice #", width: 12 },
    { key: "project", label: "Project", width: 25 },
    { key: "due_date", label: "Due Date", width: 15, getText: (r) => fmtDate(r.due_date) },
    { key: "current", label: "Current", width: 12, align: "right", getText: (r) => r.bucket === "current" ? fmtMoney(r.amount) : "" },
    { key: "1-30", label: "1–30 Days", width: 12, align: "right", getText: (r) => r.bucket === "1-30" ? fmtMoney(r.amount) : "" },
    { key: "31-60", label: "31–60 Days", width: 12, align: "right", getText: (r) => r.bucket === "31-60" ? fmtMoney(r.amount) : "" },
    { key: "61-90", label: "61–90 Days", width: 12, align: "right", getText: (r) => r.bucket === "61-90" ? fmtMoney(r.amount) : "" },
    { key: "90+", label: "90+ Days", width: 12, align: "right", getText: (r) => r.bucket === "90+" ? fmtMoney(r.amount) : "" },
    { key: "total", label: "Total", width: 12, align: "right", getText: (r) => fmtMoney(r.amount) },
  ];

  return (
    <ReportDocument
      title="AP Aging"
      subtitle={formatAsOf(params.asOf!)}
      logo={logo}
      orientation="landscape"
    >
      <SectionHeading>Approved Invoices in Accounts Payable — by Aging Bucket</SectionHeading>

      {data.rows.length === 0 ? (
        <Empty>No approved unpaid invoices in AP.</Empty>
      ) : (
        <>
          <Table
            columns={columns}
            rows={data.rows}
            emptyText="No approved unpaid invoices."
          />

          {/* Aging bucket summary */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionHeading}>Aging Summary</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {BUCKET_ORDER.map(bucket => (
                <View key={bucket} style={{ flex: 1 }} wrap={false}>
                  <View style={[styles.tr]}>
                    <View style={{ width: "100%" }}>
                      <Text style={[styles.td, { fontSize: 9 }]}>{BUCKET_LABELS[bucket]}</Text>
                    </View>
                  </View>
                  <View style={[styles.tr]}>
                    <View style={{ width: "100%" }}>
                      <Text style={[styles.tdNumStrong]}>{fmtMoney(
                        bucket === "current" ? data.current :
                        bucket === "1-30" ? data.days1to30 :
                        bucket === "31-60" ? data.days31to60 :
                        bucket === "61-90" ? data.days61to90 :
                        data.days90plus
                      )}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Net AP reconciliation — ties to GL account 2000 */}
      <View style={{ marginTop: 12 }} wrap={false}>
        <Text style={styles.sectionHeading}>Accounts Payable Reconciliation</Text>
        <View style={[styles.tr]}>
          <View style={{ width: "70%" }}><Text style={styles.td}>Approved invoices outstanding (gross)</Text></View>
          <View style={{ width: "30%" }}><Text style={styles.tdNum}>{fmtMoney(data.grandTotal)}</Text></View>
        </View>
        {data.creditsAvailable > 0.004 && (
          <View style={[styles.tr, styles.trZebra]}>
            <View style={{ width: "70%" }}><Text style={styles.td}>Less: Vendor credits available</Text></View>
            <View style={{ width: "30%" }}><Text style={[styles.tdNum, { color: colors.orange }]}>({fmtMoney(data.creditsAvailable)})</Text></View>
          </View>
        )}
        <View style={[styles.totalRow]}>
          <View style={{ width: "70%" }}>
            <Text style={[styles.tdStrong]}>Net Accounts Payable (ties to GL account 2000)</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={[styles.tdNumStrong]}>{fmtMoney(data.netAP)}</Text>
          </View>
        </View>
      </View>

      {/* Memo: pending review — not yet in AP */}
      {data.pendingReview.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <SectionHeading>Memo — Invoices Pending Review (not yet approved, not in AP)</SectionHeading>
          <Table columns={memoColumns} rows={data.pendingReview} emptyText="None." />
          <MemoTotal label="Total Pending Review" value={data.pendingReviewTotal} />
        </View>
      )}

      {/* Memo: released — checks written, in 2050 not AP */}
      {data.outstandingChecks.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <SectionHeading>Memo — Checks Issued, Not Yet Cleared (moved from AP to account 2050)</SectionHeading>
          <Table columns={memoColumns} rows={data.outstandingChecks} emptyText="None." />
          <MemoTotal label="Total Checks Outstanding" value={data.outstandingChecksTotal} />
        </View>
      )}
    </ReportDocument>
  );
}
