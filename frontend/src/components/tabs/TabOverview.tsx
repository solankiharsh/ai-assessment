"use client";

import type { Investigation } from "@/lib/types";
import { RiskMeter } from "../RiskMeter";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { formatRelativeTime } from "@/lib/utils";

export function TabOverview({ investigation: inv }: { investigation: Investigation }) {
  const riskScore = Math.min(
    100,
    (inv.risk_flags?.length ?? 0) * 12
  );

  return (
    <div className="space-y-6 p-4">
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Executive summary
        </h2>
        <p className="text-sm text-zinc-300">
          {inv.subject?.summary || `Investigation of ${inv.target}. ${inv.entities?.length ?? 0} entities, ${inv.connections?.length ?? 0} connections, ${inv.risk_flags?.length ?? 0} risk flags.`}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Risk score
          </h3>
          <RiskMeter value={riskScore} showBands />
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Confidence
          </h3>
          <ConfidenceBadge value={inv.overall_confidence} label="Overall" />
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Investigation depth
        </h3>
        <ul className="flex flex-wrap gap-4 text-sm text-zinc-400">
          <li>Entities: {inv.entities?.length ?? 0}</li>
          <li>Connections: {inv.connections?.length ?? 0}</li>
          <li>Sources (searches): {inv.search_history?.length ?? 0}</li>
          <li>Iterations: {inv.iteration} / {inv.max_iterations}</li>
        </ul>
      </section>

      {(inv.risk_flags?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Key red flags
          </h3>
          <ul className="space-y-2">
            {inv.risk_flags!.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
              >
                <span className="font-medium text-amber-400">{r.title}</span>
                <span className="mx-2 text-zinc-500">·</span>
                <span className="text-zinc-400">{r.severity}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ExpandableReasoningBlock
        title="How this conclusion was reached"
        defaultOpen={false}
        content={
          <div className="space-y-2 text-xs text-zinc-400">
            <p>Phase: {inv.current_phase}. Iterations: {inv.iteration}.</p>
            <p>Searches: {inv.total_search_calls}. LLM calls: {inv.total_llm_calls}.</p>
            {inv.search_history?.length ? (
              <p>
                Last search: {inv.search_history[inv.search_history.length - 1]?.query} at{" "}
                {inv.search_history[inv.search_history.length - 1]?.timestamp &&
                  formatRelativeTime(inv.search_history[inv.search_history.length - 1].timestamp)}
              </p>
            ) : null}
          </div>
        }
      />

      {inv.final_report && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Final report
          </h3>
          <div className="rounded border border-[var(--border)] bg-zinc-900/50 p-4 font-mono-console text-xs whitespace-pre-wrap">
            {inv.final_report}
          </div>
        </section>
      )}
    </div>
  );
}