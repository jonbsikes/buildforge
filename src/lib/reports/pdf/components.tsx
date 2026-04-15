import { View, Text } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { styles, colors } from "./styles";

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function fmtMoney(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateShort(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

export function formatDateRange(start: string, end: string): string {
  return `For ${fmtDate(start)} – ${fmtDate(end)}`;
}

export function formatAsOf(d: string): string {
  return `As of ${fmtDate(d)}`;
}

// ─── Layout components ───────────────────────────────────────────────────────

export function SectionHeading({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <Text style={styles.subHeading}>{children}</Text>;
}

export function Empty({ children = "No data for this period." }: { children?: ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

// ─── Table primitives ─────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  /** flex-based width — numbers sum to 100 for clarity */
  width: number;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  getText?: (row: T) => string;
  strong?: boolean;
}

export function TableHeader<T>({ columns }: { columns: Column<T>[] }) {
  return (
    <View style={styles.th} fixed>
      {columns.map((col) => (
        <View key={col.key} style={{ width: `${col.width}%`, paddingRight: 4 }}>
          <Text
            style={[
              styles.thCell,
              col.align === "right" ? styles.right : col.align === "center" ? styles.center : {},
            ]}
          >
            {col.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TableRow<T>({
  columns,
  row,
  zebra,
  strong,
}: {
  columns: Column<T>[];
  row: T;
  zebra?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={[styles.tr, zebra ? styles.trZebra : {}] as any} wrap={false}>
      {columns.map((col) => {
        const align =
          col.align === "right"
            ? styles.right
            : col.align === "center"
            ? styles.center
            : {};
        const baseStyle = col.strong || strong ? styles.tdStrong : styles.td;
        const node = col.render ? col.render(row) : col.getText ? col.getText(row) : "";
        return (
          <View key={col.key} style={{ width: `${col.width}%`, paddingRight: 4 }}>
            {typeof node === "string" || typeof node === "number" ? (
              <Text style={[baseStyle, align] as any}>{node}</Text>
            ) : (
              node
            )}
          </View>
        );
      })}
    </View>
  );
}

export function Table<T>({
  columns,
  rows,
  zebra = true,
  emptyText = "No rows.",
}: {
  columns: Column<T>[];
  rows: T[];
  zebra?: boolean;
  emptyText?: string;
}) {
  return (
    <View style={styles.table}>
      <TableHeader columns={columns} />
      {rows.length === 0 ? (
        <Empty>{emptyText}</Empty>
      ) : (
        rows.map((row, i) => (
          <TableRow key={i} columns={columns} row={row} zebra={zebra && i % 2 === 1} />
        ))
      )}
    </View>
  );
}

export function SubtotalRow({
  label,
  value,
  labelWidth = 60,
}: {
  label: string;
  value: string;
  labelWidth?: number;
}) {
  return (
    <View style={styles.subtotalRow} wrap={false}>
      <View style={{ width: `${labelWidth}%` }}>
        <Text style={[styles.td, styles.bold]}>{label}</Text>
      </View>
      <View style={{ width: `${100 - labelWidth}%` }}>
        <Text style={[styles.tdNumStrong]}>{value}</Text>
      </View>
    </View>
  );
}

export function TotalRow({
  label,
  value,
  labelWidth = 60,
  color,
}: {
  label: string;
  value: string;
  labelWidth?: number;
  color?: "green" | "red" | "brand" | "default";
}) {
  const valueColor =
    color === "green"
      ? { color: colors.green }
      : color === "red"
      ? { color: colors.red }
      : color === "brand"
      ? { color: colors.brand }
      : {};
  return (
    <View style={styles.totalRow} wrap={false}>
      <View style={{ width: `${labelWidth}%` }}>
        <Text style={[styles.tdStrong, { fontSize: 10 }]}>{label}</Text>
      </View>
      <View style={{ width: `${100 - labelWidth}%` }}>
        <Text style={[styles.tdNumStrong, { fontSize: 10 }, valueColor as any]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── KPI Grid ───────────────────────────────────────────────────────────────

export interface Kpi {
  label: string;
  value: string;
  tone?: "green" | "red" | "brand" | "default";
}

export function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <View style={styles.kpiGrid} wrap={false}>
      {items.map((k, i) => {
        const toneStyle =
          k.tone === "green"
            ? { color: colors.green }
            : k.tone === "red"
            ? { color: colors.red }
            : k.tone === "brand"
            ? { color: colors.brand }
            : {};
        return (
          <View key={i} style={styles.kpiCard}>
            <View style={styles.kpiCardInner}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={[styles.kpiValue, toneStyle as any]}>{k.value}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
