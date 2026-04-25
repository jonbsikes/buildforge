"use client";

import type { ReactNode, CSSProperties } from "react";
import { useState } from "react";

export type DataTableColumn<T> = {
  /** Stable id used for sort. */
  id: string;
  header: ReactNode;
  /** Render the cell. */
  cell: (row: T, index: number) => ReactNode;
  /** Numeric columns get tabular-nums + right alignment. */
  numeric?: boolean;
  /** Optional min-width / width via style. */
  width?: string | number;
  /** If provided, header click sorts. Higher is "bigger". */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  /** Header-only: hidden under sm breakpoint (mobile). */
  hideOnMobile?: boolean;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Stable row key. */
  rowKey: (row: T, index: number) => string;
  /** Optional row click handler. */
  onRowClick?: (row: T, index: number) => void;
  /** Density. Compact = 32px / Default = 44px / Comfy = 56px row height. */
  density?: "compact" | "default" | "comfy";
  /** Show density toggle in the top-right. Default true. */
  showDensityToggle?: boolean;
  /** Sticky header. Default true. */
  stickyHeader?: boolean;
  /** Empty state node. */
  empty?: ReactNode;
  /** Optional row className. */
  rowClassName?: (row: T, index: number) => string;
  className?: string;
  style?: CSSProperties;
  /** Render an extra cell on row hover (e.g. kebab). */
  rowEnd?: (row: T, index: number) => ReactNode;
};

const DENSITY_VAR: Record<NonNullable<DataTableProps<unknown>["density"]>, string> = {
  compact: "var(--row-h-compact)",
  default: "var(--row-h-default)",
  comfy: "var(--row-h-comfy)",
};

/**
 * Opinionated data-table primitive.
 *
 * - Sticky header
 * - Tabular numerics on numeric columns
 * - Hover row tint
 * - Optional sort by column
 * - Density toggle (Compact / Default)
 *
 * Per UI Review § 00 #3, § 19.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  density: initialDensity = "default",
  showDensityToggle = false,
  stickyHeader = true,
  empty,
  rowClassName,
  className = "",
  style,
  rowEnd,
}: DataTableProps<T>) {
  const [density, setDensity] = useState<NonNullable<DataTableProps<T>["density"]>>(initialDensity);
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);

  const sortable = columns.filter((c) => c.sortValue);

  let sortedRows = rows;
  if (sort) {
    const col = columns.find((c) => c.id === sort.id);
    if (col?.sortValue) {
      sortedRows = [...rows].sort((a, b) => {
        const va = col.sortValue!(a);
        const vb = col.sortValue!(b);
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const cmp = va > vb ? 1 : -1;
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
  }

  function toggleSort(id: string) {
    setSort((cur) =>
      cur?.id === id
        ? cur.dir === "asc"
          ? { id, dir: "desc" }
          : null
        : { id, dir: "asc" }
    );
  }

  return (
    <div
      className={`bg-[color:var(--card-bg)] border border-[color:var(--card-border)] rounded-[var(--card-radius)] overflow-hidden ${className}`}
      style={style}
    >
      {showDensityToggle && (
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-[color:var(--border-weak)] gap-1">
          {(["compact", "default"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                density === d
                  ? "bg-[color:var(--surface-secondary)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={stickyHeader ? "sticky top-0 z-[1] bg-[color:var(--card-bg)]" : ""}>
            <tr className="border-b border-[color:var(--border-weak)]">
              {columns.map((col) => {
                const isSorting = sort?.id === col.id;
                const canSort = !!col.sortValue;
                return (
                  <th
                    key={col.id}
                    style={col.width !== undefined ? { width: col.width, minWidth: col.width } : undefined}
                    className={`px-3 py-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-[color:var(--text-secondary)] ${
                      col.numeric ? "text-right" : "text-left"
                    } ${col.hideOnMobile ? "hidden sm:table-cell" : ""} ${
                      canSort ? "cursor-pointer select-none hover:text-[color:var(--text-primary)]" : ""
                    } ${col.className ?? ""}`}
                    onClick={() => canSort && toggleSort(col.id)}
                    aria-sort={
                      isSorting ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {isSorting && <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                    </span>
                  </th>
                );
              })}
              {rowEnd && <th className="w-9" />}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowEnd ? 1 : 0)}
                  className="px-3 py-12 text-center text-[color:var(--text-muted)]"
                >
                  {empty ?? "No data"}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  style={{ height: DENSITY_VAR[density] }}
                  className={`group border-b border-[color:var(--border-hair)] last:border-b-0 transition-colors hover:bg-[color:var(--surface-secondary)] ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${rowClassName?.(row, index) ?? ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={`px-3 py-2 align-middle ${
                        col.numeric ? "text-right tabular-nums" : ""
                      } ${col.hideOnMobile ? "hidden sm:table-cell" : ""} ${col.className ?? ""}`}
                    >
                      {col.cell(row, index)}
                    </td>
                  ))}
                  {rowEnd && (
                    <td className="px-1 align-middle text-right">
                      {rowEnd(row, index)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

