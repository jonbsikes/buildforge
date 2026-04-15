// @ts-nocheck
import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  formatDateRange,
  SectionHeading,
  Table,
  TotalRow,
  Empty,
  Column,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorSpendRow {
  vendor: string;
  total: number;
  invoiceCount: number;
  trade?: string;
}

export interface VendorSpendData {
  vendors: VendorSpendRow[];
  grandTotal: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<VendorSpendData> {
  const supabase = await createClient();
  const start = p.start!;
  const end = p.end!;

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      vendor,
      amount,
      total_amount,
      status,
      invoice_date,
      vendors(trade)
    `)
    .in("status", ["approved", "released", "cleared"])
    .gte("invoice_date", start)
    .lte("invoice_date", end);

  const vendorMap: Record<string, { vendor: string; total: number; count: number; trade?: string }> = {};

  for (const inv of invoices ?? []) {
    const vendorName = inv.vendor ?? "Unknown Vendor";
    const amount = inv.total_amount ?? inv.amount ?? 0;
    if (!vendorMap[vendorName]) {
      vendorMap[vendorName] = {
        vendor: vendorName,
        total: 0,
        count: 0,
        trade: inv.vendors?.trade,
      };
    }
    vendorMap[vendorName].total += amount;
    vendorMap[vendorName].count += 1;
  }

  const vendors = Object.values(vendorMap)
    .sort((a, b) => b.total - a.total);

  const grandTotal = vendors.reduce((s, v) => s + v.total, 0);

  return {
    vendors: vendors.map(v => ({
      vendor: v.vendor,
      total: v.total,
      invoiceCount: v.count,
      trade: v.trade,
    })),
    grandTotal,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: VendorSpendData; params: ReportParams; logo?: Buffer | string }) {
  const columns: Column<VendorSpendRow>[] = [
    {
      key: "vendor",
      label: "Vendor",
      width: 35,
      getText: (row) => row.vendor,
    },
    {
      key: "trade",
      label: "Trade",
      width: 20,
      getText: (row) => row.trade || "—",
    },
    {
      key: "invoiceCount",
      label: "# Invoices",
      width: 15,
      align: "right",
      getText: (row) => String(row.invoiceCount),
    },
    {
      key: "total",
      label: "Total Spend",
      width: 30,
      align: "right",
      render: (row) => <Text style={styles.tdNumStrong}>{fmtMoney(row.total)}</Text>,
    },
  ];

  return (
    <ReportDocument
      title="Vendor Spend"
      subtitle={formatDateRange(params.start!, params.end!)}
      logo={logo}
    >
      <SectionHeading>Vendors by Total Spend</SectionHeading>
      <Table columns={columns} rows={data.vendors} emptyText="No approved or paid invoices for this period." />
      <TotalRow
        label="Grand Total"
        value={fmtMoney(data.grandTotal)}
        labelWidth={70}
        color="brand"
      />
    </ReportDocument>
  );
}
