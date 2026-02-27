"use client";

import type { Investigation } from "@/lib/types";
import { SuggestedActions } from "./SuggestedActions";
import { cn } from "@/lib/utils";

const RISK_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "#ef4444" },
  high: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", border: "#f97316" },
  medium: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", border: "#f59e0b" },
  low: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e", border: "#22c55e" },
  info: { bg: "rgba(100, 116, 139, 0.2)", text: "#94a3b8", border: "#64748b" },
};

function getSeverityTier(riskScore: number): keyof typeof RISK_BADGE_STYLES {
  if (riskScore >= 80) return "critical";
  if (riskScore >= 50) return "high";
  if (riskScore >= 25) return "medium";
  if (riskScore > 0) return "low";
  return "info";
}

function MiniCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm font-bold",
          danger && "text-[var(--risk-high)]"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function IntelligenceReport({
  investigation: inv,
  mode,
}: {
  investigation: Investigation;
  mode: "summary" | "report";
}) {
  const riskScore = Math.min(100, (inv.risk_flags?.length ?? 0) * 12);
  const tier = getSeverityTier(riskScore);
  const style = RISK_BADGE_STYLES[tier] ?? RISK_BADGE_STYLES.info;
  const uniqueUrls = new Set(
    (inv.entities ?? []).flatMap((e) => e.source_urls ?? []).concat(
      (inv.search_history ?? []).flatMap((s) => s.result_urls ?? [])
    )
  ).size;
  const riskCategories = new Set(inv.risk_flags?.map((r) => r.category) ?? []).size;
  const openHypotheses = inv.hypotheses?.filter((h) => h.status === "open").length ?? 0;

  if (mode === "report") {
    return (
      <div className="font-mono-console whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
        {inv.final_report || "No report generated yet."}
      </div>
    );
  }

  const isHighRisk = tier === "critical" || tier === "high";

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-lg border p-3",
          isHighRisk && "animate-pulse-risk"
        )}
        style={{
          backgroundColor: style.bg,
          borderColor: style.border,
          color: style.text,
        }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider">
          {riskScore >= 80 ? "CRITICAL" : riskScore >= 50 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : riskScore > 0 ? "LOW" : "LOW RISK"}
        </div>
        <div className="mt-1 text-[10px] opacity-90">
          {riskScore > 0 ? "Review risk flags below." : "No significant risks identified."}
        </div>
        <div className="mt-2 font-mono text-sm">Score: {riskScore}</div>
      </div>

      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Subject
        </h3>
        <div className="text-sm font-medium text-[var(--foreground)]">
          {inv.subject?.full_name ?? inv.target}
        </div>
        {(inv.subject?.current_role || inv.subject?.current_organization) && (
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            {[inv.subject?.current_role, inv.subject?.current_organization]
              .filter(Boolean)
              .join(" @ ")}
          </div>
        )}
      </section>

      {(inv.risk_flags?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Evidence
          </h3>
          <ul className="space-y-1">
            {inv.risk_flags!.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--risk-high)" }}
                />
                <span className="text-[var(--foreground)]">{r.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Investigation impact
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MiniCard label="Entities found" value={inv.entities?.length ?? 0} />
          <MiniCard label="Connections" value={inv.connections?.length ?? 0} />
          <MiniCard label="LLM calls" value={inv.total_llm_calls ?? 0} />
          <MiniCard
            label="Est. cost"
            value={`$${(inv.estimated_cost_usd ?? 0).toFixed(2)}`}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Network intelligence
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MiniCard label="Unique sources" value={uniqueUrls} />
          <MiniCard label="Risk categories" value={riskCategories} />
          <MiniCard label="Open hypotheses" value={openHypotheses} />
          <MiniCard label="Search queries" value={inv.search_history?.length ?? 0} />
        </div>
      </section>

      <SuggestedActions investigation={inv} />
    </div>
  );
}
