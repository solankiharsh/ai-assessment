"use client";

import type { SearchRecord } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

export function InvestigationTimeline({
  searchHistory,
  maxItems = 10,
}: {
  searchHistory: SearchRecord[];
  maxItems?: number;
}) {
  const items = searchHistory.slice(-maxItems).reverse();
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1.5 border-l-2 border-[var(--border-strong)] pl-3">
      {items.map((r, i) => (
        <li key={`${r.iteration}-${r.timestamp}-${i}`} className="relative -left-[11px]">
          <span className="absolute h-2 w-2 rounded-full bg-[var(--muted)]" />
          <div className="text-xs">
            <span className="text-[var(--text-secondary)]">{r.phase}</span>
            <span className="mx-1 text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)]">
              {formatRelativeTime(r.timestamp)}
            </span>
          </div>
          <div className="truncate text-xs text-[var(--text-secondary)]" title={r.query}>
            {r.query}
          </div>
        </li>
      ))}
    </ul>
  );
}