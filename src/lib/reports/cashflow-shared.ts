/**
 * Shared cash-flow-statement shaping — pure functions, safe to import from
 * both server (PDF/Excel) and client (screen) code. Single source of truth so
 * the Cash Flow screen, PDF, and Excel export always show identical numbers.
 *
 * Buckets come from the get_cash_flow_statement RPC (migration 041), which
 * partitions every posted cash-account JE line exactly:
 *   beginning cash + net change = ending cash = GL cash balance.
 *
 * Homebuilder classification (ASC 230): spec homes are inventory, so
 * construction spending is an OPERATING outflow — not investing. Loan draws,
 * principal payments, and owner capital are FINANCING.
 */

export interface CashFlowBuckets {
  operating_receipts: number;
  check_float_adjustments: number;
  vendor_payments: number;
  draws_received: number;
  owner_contributions: number;
  loan_principal_payments: number;
  owner_distributions: number;
  transfers_in: number;
  transfers_out: number;
  beginning_cash: number;
  ending_cash: number;
}

export interface CashFlowStatementLine {
  /** bucket key from get_cash_flow_statement / get_cash_flow_lines */
  bucket: string;
  label: string;
  amount: number;
  isSubtraction?: boolean;
}

export interface CashFlowStatementSection {
  title: string;
  note?: string;
  lines: CashFlowStatementLine[];
  total: number;
}

export const CASH_FLOW_BUCKET_LABELS: Record<string, string> = {
  operating_receipts: "Cash receipts (deposits, refunds & other)",
  check_float_adjustments: "Checks issued, not yet cleared (timing adjustments)",
  vendor_payments: "Payments to vendors & subcontractors",
  draws_received: "Construction loan draws received",
  owner_contributions: "Owner capital contributions",
  loan_principal_payments: "Loan principal payments",
  owner_distributions: "Owner draws & return of capital",
  transfers_in: "Transfers between cash accounts (in)",
  transfers_out: "Transfers between cash accounts (out)",
};

export function parseCashFlowBuckets(raw: Record<string, number | string> | undefined): CashFlowBuckets {
  const n = (k: string) => Number(raw?.[k] ?? 0);
  return {
    operating_receipts: n("operating_receipts"),
    check_float_adjustments: n("check_float_adjustments"),
    vendor_payments: n("vendor_payments"),
    draws_received: n("draws_received"),
    owner_contributions: n("owner_contributions"),
    loan_principal_payments: n("loan_principal_payments"),
    owner_distributions: n("owner_distributions"),
    transfers_in: n("transfers_in"),
    transfers_out: n("transfers_out"),
    beginning_cash: n("beginning_cash"),
    ending_cash: n("ending_cash"),
  };
}

export function buildCashFlowStatementSections(b: CashFlowBuckets): {
  operating: CashFlowStatementSection;
  investing: CashFlowStatementSection;
  financing: CashFlowStatementSection;
  netChange: number;
} {
  const L = CASH_FLOW_BUCKET_LABELS;

  const operatingLines: CashFlowStatementLine[] = [
    ...(b.operating_receipts !== 0
      ? [{ bucket: "operating_receipts", label: L.operating_receipts, amount: b.operating_receipts }]
      : []),
    ...(b.check_float_adjustments !== 0
      ? [{ bucket: "check_float_adjustments", label: L.check_float_adjustments, amount: b.check_float_adjustments }]
      : []),
    ...(b.vendor_payments !== 0
      ? [{ bucket: "vendor_payments", label: L.vendor_payments, amount: b.vendor_payments, isSubtraction: true }]
      : []),
  ];
  const operatingTotal = b.operating_receipts + b.check_float_adjustments - b.vendor_payments;

  // Internal transfers between own cash accounts net to zero across the cash
  // pool (both legs always post in the same JE). Surface only a residual.
  const transferNet = b.transfers_in - b.transfers_out;
  const showTransfers = Math.abs(transferNet) > 0.004;
  const investingLines: CashFlowStatementLine[] = showTransfers
    ? [{ bucket: "transfers_in", label: "Transfers between cash accounts (net)", amount: Math.abs(transferNet), isSubtraction: transferNet < 0 }]
    : [];
  const investingTotal = showTransfers ? transferNet : 0;

  const financingLines: CashFlowStatementLine[] = [
    ...(b.draws_received !== 0
      ? [{ bucket: "draws_received", label: L.draws_received, amount: b.draws_received }]
      : []),
    ...(b.owner_contributions !== 0
      ? [{ bucket: "owner_contributions", label: L.owner_contributions, amount: b.owner_contributions }]
      : []),
    ...(b.loan_principal_payments !== 0
      ? [{ bucket: "loan_principal_payments", label: L.loan_principal_payments, amount: b.loan_principal_payments, isSubtraction: true }]
      : []),
    ...(b.owner_distributions !== 0
      ? [{ bucket: "owner_distributions", label: L.owner_distributions, amount: b.owner_distributions, isSubtraction: true }]
      : []),
  ];
  const financingTotal =
    b.draws_received + b.owner_contributions - b.loan_principal_payments - b.owner_distributions;

  // transferNet is included exactly once whether or not it is surfaced, so the
  // partition stays exact: beginning + netChange = ending.
  const netChange = operatingTotal + investingTotal + financingTotal + (showTransfers ? 0 : transferNet);

  return {
    operating: {
      title: "Operating Activities",
      note: "Construction spending on homes held for sale is an operating outflow (homes are inventory).",
      lines: operatingLines,
      total: operatingTotal,
    },
    investing: {
      title: "Investing Activities",
      note: "No investing activity — equipment or property purchases would appear here.",
      lines: investingLines,
      total: investingTotal,
    },
    financing: {
      title: "Financing Activities",
      lines: financingLines,
      total: financingTotal,
    },
    netChange,
  };
}
