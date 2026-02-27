"use client";

import type { Investigation, RiskFlag, SearchRecord } from "@/lib/types";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const SEVERITY_CLASS: Record<RiskFlag["severity"], string> = {
  critical: "border-red-500/50 bg-red-500/10 text-red-400",
  high: "border-orange-500/50 bg-orange-500/10 text-orange-400",
  medium: "border-amber-500/50 bg-amber-500/10 text-amber-400",
  low: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  info: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

export function TabRisk({ investigation: inv }: { investigation: Investigation }) {
  const flags = inv.risk_flags ?? [];
  const byCategory = flags.reduce((acc, r) => {
    const c = r.category;
    if (!acc[c]) acc[c] = [];
    acc[c].push(r);
    return acc;
  }, {} as Record<string, RiskFlag[]>);

  const categories = Object.entries(byCategory).sort(
    (a, b) => b[1].length - a[1].length
  );

  if (flags.length === 0) {
    const adversarialSearches = (inv.search_history ?? []).filter(
      (r: SearchRecord) => (r.phase ?? "").toLowerCase() === "adversarial"
    );

    return (
      <div className="flex h-full flex-col gap-6 p-4">
        <p className="text-sm text-zinc-400">
          No risk flags were produced by the risk analyzer. If the pipeline ran adversarial
          searches, they are listed below for context.
        </p>
        {adversarialSearches.length > 0 ? (
          <>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Adversarial search context
            </h3>
            <ul className="space-y-3 overflow-y-auto">
              {adversarialSearches.map((r: SearchRecord, i: number) => (
                <li
                  key={`${r.iteration}-${r.timestamp}-${i}`}
                  className="rounded border border-[var(--border)] bg-zinc-900/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-300">
                      Step {r.iteration} · {r.phase}
                    </span>
                    <span className="text-zinc-500 text-xs">
                      {formatRelativeTime(r.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 text-zinc-400">
                    <span className="text-zinc-500">Query:</span> {r.query}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Outcome: {r.num_results} results.
                    {r.was_useful !== undefined && (
                      <span> Useful: {r.was_useful ? "yes" : "no"}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-zinc-500">
            No adversarial search history in this case. Risk analysis runs after the director
            chooses &quot;analyze_risks&quot;; run the pipeline with enough iterations so that
            adversarial searches and risk analysis can execute.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <p className="text-xs text-[var(--muted)]">
        Risk flags are produced after adversarial debate (ADR-005). Expand &quot;Debate&quot; per flag for context.
      </p>
      {categories.map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            {category.replace(/_/g, " ")}
          </h2>
          <ul className="space-y-3">
            {items.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded border p-3",
                  SEVERITY_CLASS[r.severity] ?? SEVERITY_CLASS.info
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{r.title}</span>
                  <ConfidenceBadge value={r.confidence} size="small" />
                </div>
                <p className="mt-1 text-sm opacity-90">{r.description}</p>
                <ExpandableReasoningBlock
                  title="Debate (ADR-005)"
                  defaultOpen={false}
                  content={
                    <p className="text-xs text-[var(--muted)]">
                      This risk was assessed using adversarial debate: a proponent argues for the
                      threat, a skeptic argues against, and the risk analyzer (judge) synthesizes
                      the final flag. Debate details are shown here when the backend exposes them.
                    </p>
                  }
                />
                <ExpandableReasoningBlock
                  title="Evidence"
                  defaultOpen={false}
                  content={
                    <ul className="mt-1 space-y-1 text-xs">
                      {r.evidence?.map((url, i) => (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 hover:underline"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  }
                />
                {r.mitigating_factors?.length > 0 && (
                  <div className="mt-2 text-xs opacity-80">
                    Mitigating: {r.mitigating_factors.join("; ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}