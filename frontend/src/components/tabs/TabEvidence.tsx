"use client";

import { useMemo, useState } from "react";
import type { Investigation, SearchRecord } from "@/lib/types";
import { ConflictIndicator } from "../ConflictIndicator";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { formatRelativeTime, domainFromUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type LiveProgressEvent = {
  /** SSE event type (node_start | log | facts_update | entities_update | risks_update | complete | search | node | done) */
  event: string;
  /** Which graph node fired this event */
  node?: string;
  /** Human-readable label for the node */
  label?: string;
  /** Research phase name */
  phase?: string;
  iteration?: number;
  /** Progress 0-1 for node_start events */
  progress?: number;
  /** Log message (log events) */
  message?: string;
  /** Running count for *_update events */
  count?: number;
  /** Search query text */
  query?: string;
  /** ISO timestamp */
  ts?: string;
  /** Complete event summary fields */
  subject?: string;
  iterations?: number;
  entities?: number;
  risk_flags?: number;
  cost_usd?: number;
};

const INITIAL_URLS = 5;

export function TabEvidence({
  investigation: inv,
  liveEvents = [],
}: {
  investigation: Investigation;
  liveEvents?: LiveProgressEvent[];
}) {
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());

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
    <div className="space-y-8 p-5">
      {/* Source Audit — primary: queries and domains */}
      <section>
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Source audit
          </h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            Search queries and result URLs by phase and provider. Filter by domain to inspect coverage.
          </p>
        </header>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {triangulatedCount > 0 && (
              <span
                className="rounded-md border border-primary/50 bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary"
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
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              domainFilter === null
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                domainFilter === d
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <ul className="mt-4 space-y-3">
          {records.slice(0, 50).map((r: SearchRecord, i: number) => (
            <li
              key={`${r.timestamp}-${r.query}-${i}`}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{r.query}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(r.timestamp)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/80">
                <span>{r.provider}</span>
                <span>{r.phase}</span>
                <span>Iteration {r.iteration}</span>
                <span>{r.num_results} results</span>
              </div>
              {r.result_urls?.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  {(expandedSources.has(i) ? r.result_urls : r.result_urls.slice(0, INITIAL_URLS)).map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {domainFromUrl(url)}
                      </a>
                    </li>
                  ))}
                  {r.result_urls.length > INITIAL_URLS && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setExpandedSources((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })}
                        className="text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
                      >
                        {expandedSources.has(i) ? "Show less" : `+${r.result_urls.length - INITIAL_URLS} more`}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Execution trace — captured steps from search_history */}
      <ExpandableReasoningBlock
        title="Execution trace"
        defaultOpen={true}
        content={
          <div className="space-y-4">
            {liveEvents.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  Live progress
                </h3>
                <ul className="space-y-1.5 text-xs text-foreground">
                  {liveEvents.map((e, i) => (
                    <li key={`${e.ts ?? i}-${e.event}-${e.query ?? e.node}`}>
                      {e.event === "search" && e.query != null && (
                        <>
                          <span className="text-neutral-400">Query ({e.phase ?? "—"}):</span>{" "}
                          {e.query}
                        </>
                      )}
                      {e.event === "node" && e.node != null && (
                        <>
                          <span className="text-neutral-400">Phase:</span> {e.phase ?? "—"} ·{" "}
                          <span className="text-neutral-400">Node:</span> {e.node}
                          {e.iteration != null && <> · Iteration {e.iteration}</>}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-medium text-foreground/90">
                Captured steps (search provider per step)
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setProviderFilter(null)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    providerFilter === null
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
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
                      "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      providerFilter === p
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {filteredTrace.length === 0 ? (
                <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  No execution trace captured for this run.
                </p>
              ) : (
                <ul className="space-y-3">
                  {filteredTrace.map((r: SearchRecord, i: number) => (
                    <li
                      key={`${r.iteration}-${r.timestamp}-${i}`}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-foreground">
                          Step {r.iteration} · {r.phase}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(r.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-foreground/90">
                        <span className="text-muted-foreground">Query:</span> {r.query}
                      </p>
                      <p className="mt-1 text-xs text-foreground/80">
                        {r.provider} · {r.num_results} results
                        {r.was_useful !== undefined && (
                          <> · Useful: {r.was_useful ? "yes" : "no"}</>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
