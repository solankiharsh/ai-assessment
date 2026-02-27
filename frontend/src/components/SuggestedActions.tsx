"use client";

import type { Investigation } from "@/lib/types";

export function SuggestedActions({ investigation: inv }: { investigation: Investigation }) {
  const actions: string[] = [];
  const highCount = inv.risk_flags?.filter((r) => r.severity === "critical" || r.severity === "high").length ?? 0;
  const lowConfidenceEntities = inv.entities?.filter((e) => e.confidence < 0.5).length ?? 0;
  if (highCount > 0) actions.push(`Review ${highCount} HIGH/CRITICAL severity flag${highCount !== 1 ? "s" : ""}`);
  if (lowConfidenceEntities > 0) actions.push(`Verify ${lowConfidenceEntities} low-confidence entit${lowConfidenceEntities === 1 ? "y" : "ies"}`);
  if (inv.final_report) actions.push("Export report for stakeholder review");
  if (inv.hypotheses?.some((h) => h.status === "open")) actions.push("Review open hypotheses in Risk Analysis tab");
  if (actions.length === 0) actions.push("Continue standard monitoring");

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        Suggested actions
      </h3>
      <ul className="space-y-1.5">
        {actions.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            {a}
          </li>
        ))}
      </ul>
    </section>
  );
}
