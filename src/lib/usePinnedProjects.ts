"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "nav.pinned.projects";
const EVENT = "buildforge:pinned-projects-changed";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export function usePinnedProjects() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read());
    function refresh() {
      setIds(read());
    }
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const current = read();
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    write(next);
    setIds(next);
  }, []);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    const current = read();
    if (fromIndex < 0 || fromIndex >= current.length) return;
    const clampedTo = Math.max(0, Math.min(current.length - 1, toIndex));
    if (fromIndex === clampedTo) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    if (moved !== undefined) next.splice(clampedTo, 0, moved);
    write(next);
    setIds(next);
  }, []);

  const isPinned = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, isPinned, toggle, reorder };
}
