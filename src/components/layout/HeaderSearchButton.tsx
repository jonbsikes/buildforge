"use client";

import { Search } from "lucide-react";

/**
 * Trigger for the command palette. Dispatches the same Cmd+K keydown
 * the global listener uses, so the palette responds even though there's
 * no shared state. Per UI Review § 02 #14.
 */
export default function HeaderSearchButton() {
  function open() {
    const evt = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(evt);
  }
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const hint = isMac ? "⌘K" : "Ctrl K";
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search"
      title="Search (Cmd+K)"
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[color:var(--border-weak)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] transition-colors"
    >
      <Search size={14} aria-hidden />
      <span className="hidden sm:inline text-xs">Search</span>
      <kbd className="hidden sm:inline text-[10px] font-mono bg-[color:var(--surface-secondary)] px-1.5 py-0.5 rounded">
        {hint}
      </kbd>
    </button>
  );
}
