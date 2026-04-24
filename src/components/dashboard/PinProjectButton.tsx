"use client";

import { Star } from "lucide-react";
import { usePinnedProjects } from "@/lib/usePinnedProjects";

export default function PinProjectButton({ projectId }: { projectId: string }) {
  const { isPinned, toggle } = usePinnedProjects();
  const pinned = isPinned(projectId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(projectId);
      }}
      aria-label={pinned ? "Unpin project" : "Pin project to sidebar"}
      title={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
      className="shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
    >
      <Star
        size={14}
        strokeWidth={2}
        style={{
          color: pinned ? "var(--brand-blue)" : "#CBD5E1",
          fill: pinned ? "var(--brand-blue)" : "none",
        }}
      />
    </button>
  );
}
