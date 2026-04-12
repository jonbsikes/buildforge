/**
 * Compact status indicator: colored dot + text label.
 * Used in dense financial tables where full badges take too much space.
 */

const DOT_COLORS: Record<string, string> = {
  pending_review: "bg-amber-400",
  approved: "bg-blue-500",
  released: "bg-purple-500",
  cleared: "bg-emerald-500",
  disputed: "bg-red-500",
  void: "bg-gray-300",
  draft: "bg-gray-400",
  submitted: "bg-amber-500",
  funded: "bg-blue-500",
  paid: "bg-emerald-500",
  active: "bg-blue-500",
  pending: "bg-amber-400",
};

const DOT_LABELS: Record<string, string> = {
  pending_review: "Pending",
  approved: "Approved",
  released: "Released",
  cleared: "Cleared",
  disputed: "Disputed",
  void: "Void",
  draft: "Draft",
  submitted: "Submitted",
  funded: "Funded",
  paid: "Paid",
  active: "Active",
  pending: "Pending",
};

interface StatusDotProps {
  status: string;
  className?: string;
}

export default function StatusDot({ status, className = "" }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-gray-700 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_COLORS[status] || "bg-gray-300"}`} />
      {DOT_LABELS[status] || status.replace(/_/g, " ")}
    </span>
  );
}
