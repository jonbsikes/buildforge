import type { ReactNode } from "react";

type MetadataChipProps = {
  icon?: ReactNode;
  children: ReactNode;
  variant?: "default" | "accent";
  className?: string;
};

/**
 * Outlined chip for facts (plan name, lot #, phase name, permit #, etc.).
 * For state (pending, approved, delayed), use StatusBadge instead.
 */
export default function MetadataChip({
  icon,
  children,
  variant = "default",
  className = "",
}: MetadataChipProps) {
  const borderColor =
    variant === "accent" ? "var(--brand-blue)" : "var(--border-strong)";
  const textColor = variant === "accent" ? "var(--brand-blue)" : "#334155";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded text-[11px] leading-none py-1 px-2 ${className}`}
      style={{
        border: `1px solid ${borderColor}`,
        color: textColor,
      }}
    >
      {icon && (
        <span className="inline-flex items-center [&>svg]:w-3 [&>svg]:h-3">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
