"use client";

import { useMemo } from "react";
import type { SearchRecord, SearchPhase } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

const PHASE_LABELS: Record<SearchPhase, string> = {
  baseline: "Baseline established",
  breadth: "Breadth search mapping entity landscape",
  depth: "Depth search into entities and sources",
  adversarial: "Adversarial search into litigation and risks",
  triangulation: "Triangulating cross-source validation",
  synthesis: "Synthesis: generating report",
};

const PHASE_ACTION: Record<SearchPhase, string> = {
  baseline: "Initial discovery queries to build foundational profile.",
  breadth: "Broad search to discover entities and relationships.",
  depth: "Targeted verification and attribute extraction.",
  adversarial: "Queries for negative signals, litigation, and regulatory exposure.",
  triangulation: "Cross-reference across providers to confirm or contradict claims.",
  synthesis: "Risk assessment and report generation.",
};

interface InvestigationLogsProps {
  searchHistory: SearchRecord[];
  subjectName?: string;
  maxEntries?: number;
}

function phaseOrder(p: string): number {
  const order: Record<string, number> = {
    baseline: 1,
    breadth: 2,
    depth: 3,
    adversarial: 4,
    triangulation: 5,
    synthesis: 6,
  };
  return order[p] ?? 0;
}

export function InvestigationLogs({
  searchHistory,
  subjectName = "Subject",
  maxEntries = 50,
}: InvestigationLogsProps) {
  const entries = useMemo(() => {
    const byPhaseIter = new Map<string, SearchRecord[]>();
    for (const r of searchHistory) {
      const phase = (r.phase ?? "baseline").toLowerCase();
      const iter = r.iteration ?? 0;
      const key = `${phase}-${iter}`;
      if (!byPhaseIter.has(key)) byPhaseIter.set(key, []);
      byPhaseIter.get(key)!.push(r);
    }
    const keys = Array.from(byPhaseIter.keys()).sort((a, b) => {
      const [pa, ia] = a.split("-");
      const [pb, ib] = b.split("-");
      const iterA = parseInt(ia, 10);
      const iterB = parseInt(ib, 10);
      if (iterA !== iterB) return iterA - iterB;
      return phaseOrder(pa) - phaseOrder(pb);
    });
    return keys.slice(-maxEntries).flatMap((key) => {
      const records = byPhaseIter.get(key)!;
      const first = records[0];
      const phase = (first?.phase ?? "baseline").toLowerCase() as SearchPhase;
      const iteration = first?.iteration ?? 0;
      const timestamp = first?.timestamp ?? "";
      const sampleQuery = first?.query ?? "";
      const count = records.length;
      const finding =
        phase === "synthesis"
          ? "Generating executive due diligence report."
          : count > 0
            ? `${count} search${count !== 1 ? "es" : ""} executed. ${sampleQuery ? `Sample: "${sampleQuery.slice(0, 60)}${sampleQuery.length > 60 ? "…" : ""}"` : ""}`
            : "";
      return {
        phase,
        iteration,
        timestamp,
        label: PHASE_LABELS[phase] ?? phase,
        action: PHASE_ACTION[phase] ?? "Search and extraction.",
        finding: finding.trim(),
        queries: records.map((r) => r.query).filter(Boolean),
      };
    });
  }, [searchHistory, maxEntries]);

  if (entries.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Investigation logs
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Phase-by-phase progress
        </span>
      </div>
      <ul className="max-h-48 overflow-y-auto px-4 py-3">
        {entries.map((e, i) => (
          <li
            key={`${e.phase}-${e.iteration}-${i}`}
            className="border-l-2 border-[var(--border-strong)] pl-3 pb-3 last:pb-0"
          >
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
              <span className="font-medium uppercase">{e.phase}</span>
              <span>{formatRelativeTime(e.timestamp)}</span>
            </div>
            <div className="mt-0.5 text-xs font-medium text-[var(--foreground)]">
              Phase {e.iteration}: {e.label}.
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
              <span className="text-[var(--muted)]">Action:</span> {e.action}
            </div>
            {e.finding && (
              <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                <span className="text-[var(--muted)]">Finding:</span> {e.finding}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
