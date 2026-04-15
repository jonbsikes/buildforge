// @ts-nocheck
import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles } from "../pdf/styles";
import {
  fmtMoney,
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

interface AgingData {
  rows: AgingRow[];
  bucketTotals: Record<AgingBucket, number>;
  grandTotal: number;
}

export interface APAgingData {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  rows: AgingRow[];
  grandTotal: number;
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

  const { data: invoices } = await supabase
    .from("invoices")
    .select("vendor, invoice_number, due_date, amount, project_id, projects(name)")
    .in("status", ["pending_review", "approved", "released"]);

  const rows: AgingRow[] = (invoices ?? []).map(inv => {
    const project = inv.projects as { name: string } | null;
    const dueDate = inv.due_date ?? asOf;
    const bucket = getBucket(dueDate, asOf);

    return {
      vendor: inv.vendor ?? "Unknown Vendor",
      invoice_number: inv.invoice_number ?? "—",
      project: project?.name ?? "No Project",
      due_date: dueDate,
      amount: inv.amount ?? 0,
      bucket,
    };
  });

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

export function Pdf({ data, params, logo }: { data: APAgingData; params: ReportParams; logo?: Buffer | string }) {
  const columns: Column<AgingRow>[] = [
    { key: "vendor", label: "Vendor", width: 20 },
    { key: "invoice_number", label: "Invoice #", width: 12 },
    { key: "project", label: "Project", width: 25 },
    { key: "due_date", label: "Due Date", width: 15 },
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
      <SectionHeading>Outstanding Invoices by Aging Bucket</SectionHeading>

      {data.rows.length === 0 ? (
        <Empty>No outstanding invoices.</Empty>
      ) : (
        <>
          <Table
            columns={columns}
            rows={data.rows}
            emptyText="No outstanding invoices."
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

          {/* Grand total */}
          <View style={{ marginTop: 12 }}>
            <View style={[styles.totalRow]}>
              <View style={{ width: "70%" }}>
                <Text style={[styles.tdStrong]}>Total Outstanding AP</Text>
              </View>
              <View style={{ width: "30%" }}>
                <Text style={[styles.tdNumStrong]}>{fmtMoney(data.grandTotal)}</Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ReportDocument>
  );
}
