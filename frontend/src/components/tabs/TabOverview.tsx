"use client";

import type { Investigation, RiskFlag } from "@/lib/types";
import { RiskMeter } from "../RiskMeter";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { domainFromUrl } from "@/lib/utils";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
const SEVERITY_COLORS: Record<string, string> = {
  critical: "var(--risk-critical)",
  high: "var(--risk-high)",
  medium: "var(--risk-medium)",
  low: "var(--risk-low)",
  info: "var(--risk-info)",
};

function topRiskFlagsBySeverity(flags: RiskFlag[], limit: number): RiskFlag[] {
  return [...flags]
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number]) -
        SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number])
    )
    .slice(0, limit);
}

export function TabOverview({
  investigation: inv,
  onViewAllRisk,
}: {
  investigation: Investigation;
  onViewAllRisk?: () => void;
}) {

  // Use only API-derived risk score (no client fallback) so value matches list and is never synthetic
  const riskScore = inv.risk_score ?? 0;
  const riskLevel =
    inv.report_risk_level ??
    (riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : riskScore > 0 ? "low" : "clear");
  const displayLevel = riskLevel === "clear" ? "low" : riskLevel;
  const riskColor = SEVERITY_COLORS[displayLevel] ?? SEVERITY_COLORS.info;
  const flags = inv.risk_flags ?? [];
  const topFindings = topRiskFlagsBySeverity(flags, 5);
  const hasReportFindings = (inv.report_risk_findings?.length ?? 0) > 0 && flags.length === 0;

  return (
    <div className="space-y-6 p-5">
      {/* Decision card — risk verdict first, then summary, then metrics in a clear grid */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {/* 1. Risk verdict — primary focus */}
        <div
          className="inline-block rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide"
          style={{
            backgroundColor: `${riskColor}20`,
            color: riskColor,
          }}
        >
          {displayLevel === "critical" || displayLevel === "high"
            ? `${displayLevel.toUpperCase()} RISK`
            : displayLevel === "low"
              ? "LOW RISK"
              : "MEDIUM RISK"}
        </div>

        {/* 2. One-line summary — secondary */}
        <p className="mt-3 text-sm leading-relaxed text-foreground/90">
          {inv.subject?.summary ||
            `Investigation of ${inv.target}. ${inv.entities?.length ?? 0} entities, ${inv.connections?.length ?? 0} connections, ${flags.length} risk flags.`}
        </p>

        {/* 3. Metrics row — risk score (label above meter) and confidence (label + badge) */}
        <div className="mt-6 flex flex-wrap items-start gap-8 border-t border-border pt-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/80">
              Risk score
            </span>
            <div className="flex items-end gap-3">
              <RiskMeter value={riskScore} showBands />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/80">
              Confidence
            </span>
            <ConfidenceBadge value={inv.overall_confidence} />
          </div>
        </div>
      </section>

      {/* Subject profile — collapsible, default open */}
      <ExpandableReasoningBlock
        title="Subject profile"
        defaultOpen={true}
        content={
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-neutral-400 font-medium">Name:</span>{" "}
              <span className="text-neutral-100">{inv.subject?.full_name ?? inv.target}</span>
            </div>
            {(inv.subject?.current_role ?? inv.subject?.current_organization) && (
              <div>
                <span className="text-neutral-400 font-medium">Role / org:</span>{" "}
                <span className="text-neutral-100">
                  {[inv.subject.current_role, inv.subject.current_organization]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            )}
            {(inv.subject?.aliases?.length ?? 0) > 0 && (
              <div>
                <span className="text-neutral-400 font-medium">Aliases:</span>{" "}
                <span className="text-neutral-100">{inv.subject!.aliases!.join(", ")}</span>
              </div>
            )}
            {(inv.subject?.professional_history?.length ?? 0) > 0 && (
              <div>
                <span className="text-neutral-400 font-medium">Professional history:</span>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-neutral-300">
                  {inv.subject!.professional_history!.slice(0, 5).map((entry: Record<string, string>, i: number) => (
                    <li key={i}>
                      {typeof entry === "object"
                        ? Object.entries(entry)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" — ")
                        : String(entry)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(inv.subject?.known_associations?.length ?? 0) > 0 && (
              <div>
                <span className="text-neutral-400 font-medium">Known associations:</span>{" "}
                <span className="text-neutral-100">{inv.subject!.known_associations!.slice(0, 12).join(", ")}</span>
              </div>
            )}
          </div>
        }
      />

      {/* Key findings — top 5 by severity, with citations */}
      {(topFindings.length > 0 || hasReportFindings) && (
        <section>
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Key findings
          </h3>
          <ul className="space-y-2">
            {topFindings.map((r) => {
              const color = SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.info;
              return (
                <li
                  key={r.id}
                  className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
                >
                  <div
                    className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {r.title}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {r.severity}
                      </span>
                    </div>
                    {r.description && (
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {r.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Investigation scope — collapsible, default collapsed */}
      <ExpandableReasoningBlock
        title="Investigation scope"
        defaultOpen={false}
        content={
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">Entities</span>
              <div className="font-mono font-medium text-neutral-200">{inv.entities?.length ?? 0}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">Connections</span>
              <div className="font-mono font-medium text-neutral-200">{inv.connections?.length ?? 0}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">Sources</span>
              <div className="font-mono font-medium text-neutral-200">{inv.search_history?.length ?? 0}</div>
            </div>
          </div>
        }
      />
    </div>
  );
}
