interface BudgetBarProps {
  spent: number;
  budget: number;
  compact?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function BudgetBar({
  spent,
  budget,
  compact = false,
}: BudgetBarProps) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 110) : 0;
  const over = spent > budget && budget > 0;

  return (
    <div className="w-full">
      {!compact && (
        <div className="flex justify-between text-xs mb-1 tabular-nums">
          <span className="text-gray-500">{fmt(spent)} spent</span>
          <span
            className={over ? "font-semibold" : "text-gray-400"}
            style={over ? { color: "var(--status-over)" } : undefined}
          >
            {fmt(budget)}
          </span>
        </div>
      )}
      <div
        className={`w-full bg-gray-100 rounded-full overflow-hidden ${
          compact ? "h-1.5" : "h-2"
        }`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: over
              ? "var(--status-over)"
              : pct > 85
                ? "var(--status-warning)"
                : "var(--brand-blue)",
          }}
        />
      </div>
      {compact && (
        <div className="flex justify-between text-[11px] mt-0.5 tabular-nums">
          <span className="text-gray-500">{fmt(spent)}</span>
          <span
            className={over ? "font-medium" : "text-gray-400"}
            style={over ? { color: "var(--status-over)" } : undefined}
          >
            / {fmt(budget)}
          </span>
        </div>
      )}
    </div>
  );
}
