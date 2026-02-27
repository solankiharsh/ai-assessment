"use client";

import { useState } from "react";
import type { Investigation, SearchRecord } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type LiveProgressEvent = {
  event: string;
  node?: string;
  phase?: string;
  iteration?: number;
  query?: string;
  ts?: string;
};

export function TabTrace({
  investigation: inv,
  liveEvents = [],
}: {
  investigation: Investigation;
  liveEvents?: LiveProgressEvent[];
}) {
  const [mono, setMono] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  const history = inv.search_history ?? [];
  const providers = Array.from(
    new Set(history.map((r) => r.provider))
  ).sort();
  const filtered = providerFilter
    ? history.filter((r) => r.provider === providerFilter)
    : history;

  return (
    <div className="flex h-full flex-col p-4">
      {liveEvents.length > 0 && (
        <div className="mb-4 rounded border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Live progress
          </h3>
          <ul className="space-y-1.5 text-xs">
            {liveEvents.map((e, i) => (
              <li key={`${e.ts ?? i}-${e.event}-${e.query ?? e.node}`} className="text-[var(--foreground)]">
                {e.event === "search" && e.query != null && (
                  <>
                    <span className="text-[var(--muted)]">Query ({e.phase ?? "—"}):</span> {e.query}
                  </>
                )}
                {e.event === "node" && e.node != null && (
                  <>
                    <span className="text-[var(--muted)]">Phase:</span> {e.phase ?? "—"} ·{" "}
                    <span className="text-[var(--muted)]">Node:</span> {e.node}
                    {e.iteration != null && (
                      <> · Iteration {e.iteration}</>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mb-3 text-xs text-[var(--muted)]">
        Search provider (Tavily/Brave) per step. Model per step is shown when the backend exposes it (ADR-002).
      </p>
      <div className="mb-4 flex items-center justify-between gap-4">
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
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={mono}
            onChange={(e) => setMono(e.target.checked)}
            className="rounded border-[var(--border-strong)]"
          />
          Monospace
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
          No execution trace. Run with --debug for iteration snapshots.
        </div>
      ) : (
        <ul className={cn("space-y-3", mono && "font-mono-console text-xs")}>
          {filtered.map((r: SearchRecord, i: number) => (
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
              <div className="mt-1 text-xs text-[var(--muted)]">
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
  );
}