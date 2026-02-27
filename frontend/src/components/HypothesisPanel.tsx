"use client";

import type { Hypothesis } from "@/lib/types";
import { ExpandableReasoningBlock } from "./ExpandableReasoningBlock";

export function HypothesisPanel({
  hypotheses,
  maxItems = 5,
}: {
  hypotheses: Hypothesis[];
  maxItems?: number;
}) {
  const list = hypotheses.slice(0, maxItems);
  if (list.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        Hypotheses
      </h3>
      <ul className="space-y-2">
        {list.map((h) => (
          <li key={h.id} className="rounded border border-[var(--border)] bg-[var(--bg-card)] p-2">
            <ExpandableReasoningBlock
              title={h.description}
              content={
                <div className="mt-1 space-y-1 text-xs text-[var(--text-secondary)]">
                  <div>
                    <span className="text-[var(--muted)]">Status:</span> {h.status}
                  </div>
                  {h.evidence_for?.length > 0 && (
                    <div>
                      <span className="text-[var(--muted)]">For:</span>{" "}
                      {h.evidence_for.slice(0, 2).join("; ")}
                    </div>
                  )}
                  {h.evidence_against?.length > 0 && (
                    <div>
                      <span className="text-[var(--muted)]">Against:</span>{" "}
                      {h.evidence_against.slice(0, 2).join("; ")}
                    </div>
                  )}
                </div>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
