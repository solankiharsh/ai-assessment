"use client";

import { useMemo, useState } from "react";
import type { Investigation, SearchRecord } from "@/lib/types";
import { ConflictIndicator } from "../ConflictIndicator";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { formatRelativeTime, domainFromUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type LiveProgressEvent = {
  event: string;
  node?: string;
  phase?: string;
  iteration?: number;
  query?: string;
  ts?: string;
};

export function TabEvidence({
  investigation: inv,
  liveEvents = [],
}: {
  investigation: Investigation;
  liveEvents?: LiveProgressEvent[];
}) {
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  const allUrls = useMemo(() => {
    const set = new Set<string>();
    inv.search_history?.forEach((r) => {
      r.result_urls?.forEach((u) => set.add(u));
    });
    inv.entities?.forEach((e) => {
      e.source_urls?.forEach((u) => set.add(u));
    });
    return Array.from(set);
  }, [inv.search_history, inv.entities]);

  const byDomain = useMemo(() => {
    const map = new Map<string, string[]>();
    allUrls.forEach((url) => {
      const d = domainFromUrl(url);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(url);
    });
    return map;
  }, [allUrls]);

  const domains = useMemo(() => Array.from(byDomain.keys()).sort(), [byDomain]);

  const records = useMemo(() => {
    let list = inv.search_history ?? [];
    if (domainFilter) {
      list = list.filter((r) =>
        r.result_urls?.some((u) => domainFromUrl(u) === domainFilter)
      );
    }
    return list.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [inv.search_history, domainFilter]);

  const history = inv.search_history ?? [];
  const providers = Array.from(new Set(history.map((r) => r.provider))).sort();
  const filteredTrace = providerFilter
    ? history.filter((r) => r.provider === providerFilter)
    : history;

  const conflictCount = 0;
  const triangulatedCount = useMemo(() => {
    const byQuery = new Map<string, Set<string>>();
    inv.search_history?.forEach((r) => {
      const q = r.query?.toLowerCase().trim() ?? "";
      if (!q) return;
      if (!byQuery.has(q)) byQuery.set(q, new Set());
      byQuery.get(q)!.add((r.provider ?? "").toLowerCase());
    });
    let count = 0;
    byQuery.forEach((providers) => {
      if (providers.has("tavily") && providers.has("brave")) count += 1;
    });
    return count;
  }, [inv.search_history]);

  return (
    <div className="space-y-6 p-4">
      {/* Source Audit — default expanded */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Source audit
          </h2>
          <div className="flex items-center gap-2">
            {triangulatedCount > 0 && (
              <span
                className="rounded border border-[var(--purple)]/50 bg-[var(--purple)]/15 px-2 py-0.5 text-[10px] text-[var(--purple)]"
                title="Queries run on both Tavily and Brave (ADR-004)"
              >
                Triangulated: {triangulatedCount}
              </span>
            )}
            {conflictCount > 0 && <ConflictIndicator count={conflictCount} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDomainFilter(null)}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              domainFilter === null
                ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
                : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            )}
          >
            All
          </button>
          {domains.slice(0, 15).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomainFilter(d)}
              className={cn(
                "rounded border px-2 py-1 text-xs",
                domainFilter === d
                  ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          {records.slice(0, 50).map((r: SearchRecord, i: number) => (
            <li
              key={`${r.timestamp}-${r.query}-${i}`}
              className="rounded border border-[var(--border)] bg-[var(--bg-card)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-[var(--foreground)]">{r.query}</span>
                <span className="text-xs text-[var(--muted)]">
                  {formatRelativeTime(r.timestamp)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted)]">
                <span>{r.provider}</span>
                <span>{r.phase}</span>
                <span>Iteration {r.iteration}</span>
                <span>{r.num_results} results</span>
              </div>
              {r.result_urls?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {r.result_urls.slice(0, 5).map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[var(--accent)] hover:underline"
                      >
                        {domainFromUrl(url)}
                      </a>
                    </li>
                  ))}
                  {r.result_urls.length > 5 && (
                    <li className="text-[10px] text-[var(--muted)]">
                      +{r.result_urls.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Execution trace — collapsible */}
      <ExpandableReasoningBlock
        title="Execution trace"
        defaultOpen={false}
        content={
          <div className="space-y-3">
            {liveEvents.length > 0 && (
              <div className="rounded border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Live progress
                </h3>
                <ul className="space-y-1.5 text-xs">
                  {liveEvents.map((e, i) => (
                    <li
                      key={`${e.ts ?? i}-${e.event}-${e.query ?? e.node}`}
                      className="text-[var(--foreground)]"
                    >
                      {e.event === "search" && e.query != null && (
                        <>
                          <span className="text-[var(--muted)]">Query ({e.phase ?? "—"}):</span>{" "}
                          {e.query}
                        </>
                      )}
                      {e.event === "node" && e.node != null && (
                        <>
                          <span className="text-[var(--muted)]">Phase:</span> {e.phase ?? "—"} ·{" "}
                          <span className="text-[var(--muted)]">Node:</span> {e.node}
                          {e.iteration != null && <> · Iteration {e.iteration}</>}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-[var(--muted)]">
              Search provider (Tavily/Brave) per step.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setProviderFilter(null)}
                className={cn(
                  "rounded border px-2 py-1 text-xs",
                  providerFilter === null
                    ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                )}
              >
                All
              </button>
              {providers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProviderFilter(p)}
                  className={cn(
                    "rounded border px-2 py-1 text-xs",
                    providerFilter === p
                      ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            {filteredTrace.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No execution trace. Run with --debug for iteration snapshots.
              </p>
            ) : (
              <ul className="space-y-3 text-xs">
                {filteredTrace.map((r: SearchRecord, i: number) => (
                  <li
                    key={`${r.iteration}-${r.timestamp}-${i}`}
                    className="rounded border border-[var(--border)] bg-[var(--bg-card)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--foreground)]">
                        Step {r.iteration} · {r.phase}
                      </span>
                      <span className="text-[var(--muted)]">
                        {formatRelativeTime(r.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 text-[var(--text-secondary)]">
                      <span className="text-[var(--muted)]">Action:</span> Search ({r.provider})
                    </div>
                    <div className="mt-0.5">
                      <span className="text-[var(--muted)]">Query:</span> {r.query}
                    </div>
                    <div className="mt-1 text-[var(--muted)]">
                      Outcome: {r.num_results} results.
                      {r.was_useful !== undefined && (
                        <span> Useful: {r.was_useful ? "yes" : "no"}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />
    </div>
  );
}
