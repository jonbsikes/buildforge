const STYLES: Record<string, string> = {
  complete: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-blue-100 text-blue-700",
  not_started: "bg-gray-100 text-gray-500",
  delayed: "bg-orange-100 text-orange-700",
  pending_review: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  released: "bg-purple-100 text-purple-700",
  cleared: "bg-emerald-100 text-emerald-700",
  active: "bg-blue-100 text-blue-700",
  pre_construction: "bg-gray-100 text-gray-600",
  on_hold: "bg-amber-100 text-amber-700",
  disputed: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-400",
};

const LABELS: Record<string, string> = {
  complete: "Complete",
  in_progress: "In Progress",
  not_started: "Not Started",
  delayed: "Delayed",
  pending_review: "Pending Review",
  approved: "Approved",
  released: "Released",
  cleared: "Cleared",
  active: "Active",
  pre_construction: "Pre-Construction",
  on_hold: "On Hold",
  disputed: "Disputed",
  void: "Void",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
        STYLES[status] || "bg-gray-100 text-gray-500"
      } ${className}`}
    >
      {LABELS[status] || status}
    </span>
  );
}
