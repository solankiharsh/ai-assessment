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
    <ul className="space-y-1.5 border-l-2 border-zinc-700 pl-3">
      {items.map((r, i) => (
        <li key={`${r.iteration}-${r.timestamp}-${i}`} className="relative -left-[11px]">
          <span className="absolute h-2 w-2 rounded-full bg-zinc-500" />
          <div className="text-xs">
            <span className="text-zinc-400">{r.phase}</span>
            <span className="mx-1 text-zinc-600">·</span>
            <span className="text-zinc-500">
              {formatRelativeTime(r.timestamp)}
            </span>
          </div>
          <div className="truncate text-xs text-zinc-400" title={r.query}>
            {r.query}
          </div>
        </li>
      ))}
    </ul>
  );
}