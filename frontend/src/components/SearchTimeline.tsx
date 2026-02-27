"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SearchRecord, SearchPhase } from "@/lib/types";

const PHASE_COLORS: Record<SearchPhase, string> = {
  baseline: "#3b82f6",
  breadth: "#a855f7",
  depth: "#06b6d4",
  adversarial: "#ef4444",
  triangulation: "#f59e0b",
  synthesis: "#22c55e",
};

const PROVIDER_COLORS: Record<string, string> = {
  tavily: "rgba(59, 130, 246, 0.7)",
  brave: "rgba(168, 85, 247, 0.7)",
  default: "rgba(100, 116, 139, 0.5)",
};

interface SearchTimelineProps {
  searchHistory: SearchRecord[];
  maxBars?: number;
}

export function SearchTimeline({
  searchHistory,
  maxBars = 20,
}: SearchTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);

  const byIteration = useMemo(() => {
    const map = new Map<number, { total: number; byProvider: Record<string, number> }>();
    for (const r of searchHistory) {
      const iter = r.iteration ?? 0;
      if (!map.has(iter)) map.set(iter, { total: 0, byProvider: {} });
      const entry = map.get(iter)!;
      entry.total += 1;
      const prov = (r.provider ?? "default").toLowerCase();
      entry.byProvider[prov] = (entry.byProvider[prov] ?? 0) + 1;
    }
    const iters = Array.from(map.keys()).sort((a, b) => a - b);
    return iters.slice(-maxBars).map((iter) => ({
      iteration: iter,
      ...map.get(iter)!,
    }));
  }, [searchHistory, maxBars]);

  const totalSearches = searchHistory.length;
  const usefulCount = searchHistory.filter((r) => r.was_useful).length;
  const usefulRatio =
    totalSearches > 0 ? Math.round((usefulCount / totalSearches) * 100) : 0;
  const uniqueDomains = useMemo(() => {
    const urls = searchHistory.flatMap((r) => r.result_urls ?? []);
    const domains = new Set<string>();
    for (const u of urls) {
      try {
        domains.add(new URL(u).hostname.replace(/^www\./, ""));
      } catch {
        /**/
      }
    }
    return domains.size;
  }, [searchHistory]);

  const maxTotal = Math.max(1, ...byIteration.map((b) => b.total));

  if (searchHistory.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
      >
        <span className="flex items-center gap-2">
          Search Activity
          {Array.from(new Set(searchHistory.map((r) => r.phase))).map((p) => (
            <span
              key={p}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
              style={{
                backgroundColor: `${PHASE_COLORS[p as SearchPhase] ?? "#64748b"}33`,
                color: PHASE_COLORS[p as SearchPhase] ?? "#94a3b8",
              }}
            >
              {p}
            </span>
          ))}
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
        ) : (
          <ChevronUp className="h-4 w-4 text-[var(--muted)]" />
        )}
      </button>
      {!collapsed && (
        <div className="border-t border-[var(--border)] px-4 pb-3 pt-2">
          <div className="mb-2 flex h-16 items-end gap-0.5">
            {byIteration.map((bar) => {
              const topProvider = Object.entries(bar.byProvider).sort(
                (a, b) => b[1] - a[1]
              )[0]?.[0];
              const fill =
                topProvider && PROVIDER_COLORS[topProvider]
                  ? PROVIDER_COLORS[topProvider]
                  : PROVIDER_COLORS.default;
              return (
                <div
                  key={bar.iteration}
                  className="flex-1 rounded-t transition-all"
                  style={{
                    height: `${Math.max(4, (bar.total / maxTotal) * 100)}%`,
                    backgroundColor: fill,
                  }}
                  title={`Iteration ${bar.iteration}: ${bar.total} searches`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-[10px]">
            <span className="text-[var(--muted)]">
              Iterations: <span className="font-mono text-[var(--foreground)]">{byIteration.length}</span>
            </span>
            <span className="text-[var(--muted)]">
              Total searches: <span className="font-mono text-[var(--foreground)]">{totalSearches}</span>
            </span>
            <span className="text-[var(--muted)]">
              Useful: <span className="font-mono text-[var(--foreground)]">{usefulRatio}%</span>
            </span>
            <span className="text-[var(--muted)]">
              Unique domains: <span className="font-mono text-[var(--foreground)]">{uniqueDomains}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
