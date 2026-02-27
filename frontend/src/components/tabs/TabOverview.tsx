"use client";

import type { Investigation, RiskFlag } from "@/lib/types";
import { RiskMeter } from "../RiskMeter";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { useUIStore } from "@/store/useUIStore";
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
}: {
  investigation: Investigation;
}) {
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const riskScore = inv.risk_score ?? Math.min(100, (inv.risk_flags?.length ?? 0) * 12);
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
      {/* Decision card — full width, top */}
      <section className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div
          className="mb-3 inline-block rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide"
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
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {inv.subject?.summary ||
            `Investigation of ${inv.target}. ${inv.entities?.length ?? 0} entities, ${inv.connections?.length ?? 0} connections, ${flags.length} risk flags.`}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-32">
              <RiskMeter value={riskScore} showBands />
            </div>
            <span className="text-xs text-[var(--muted)]">Risk score</span>
          </div>
          <ConfidenceBadge value={inv.overall_confidence} label="Confidence" />
        </div>
      </section>

      {/* Subject profile — collapsible, default open */}
      <ExpandableReasoningBlock
        title="Subject profile"
        defaultOpen={true}
        content={
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-[var(--muted)]">Name:</span>{" "}
              {inv.subject?.full_name ?? inv.target}
            </div>
            {(inv.subject?.current_role ?? inv.subject?.current_organization) && (
              <div>
                <span className="text-[var(--muted)]">Role / org:</span>{" "}
                {[inv.subject.current_role, inv.subject.current_organization]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {(inv.subject?.aliases?.length ?? 0) > 0 && (
              <div>
                <span className="text-[var(--muted)]">Aliases:</span>{" "}
                {inv.subject!.aliases!.join(", ")}
              </div>
            )}
            {(inv.subject?.professional_history?.length ?? 0) > 0 && (
              <div>
                <span className="text-[var(--muted)]">Professional history:</span>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[var(--text-secondary)]">
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
                <span className="text-[var(--muted)]">Known associations:</span>{" "}
                {inv.subject!.known_associations!.slice(0, 8).join(", ")}
              </div>
            )}
          </div>
        }
      />

      {/* Key findings — top 5 by severity, with citations */}
      {(topFindings.length > 0 || hasReportFindings) && (
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Key findings
          </h3>
          <ul className="space-y-2">
            {topFindings.map((r) => {
              const color = SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.info;
              return (
                <li
                  key={r.id}
                  className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
                >
                  <div
                    className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">
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
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {r.description}
                      </p>
                    )}
                    {r.evidence?.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                        Sources:{" "}
                        {r.evidence.slice(0, 3).map((url, i) => (
                          <span key={url}>
                            {i > 0 && ", "}
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--accent)] hover:underline"
                            >
                              {domainFromUrl(url)}
                            </a>
                          </span>
                        ))}
                        {r.evidence.length > 3 && ` +${r.evidence.length - 3}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
            {hasReportFindings &&
              inv.report_risk_findings!.slice(0, 5).map((r, i) => {
                const color = SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.medium;
                return (
                  <li
                    key={`report-${i}`}
                    className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
                  >
                    <div
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--foreground)]">
                          {r.title}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {r.severity}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {r.description}
                      </p>
                    </div>
                  </li>
                );
              })}
          </ul>
          {flags.length > 5 && (
            <button
              type="button"
              onClick={() => setActiveTab("risk")}
              className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              View all {flags.length} findings →
            </button>
          )}
        </section>
      )}

      {/* Investigation scope — collapsible, default collapsed */}
      <ExpandableReasoningBlock
        title="Investigation scope"
        defaultOpen={false}
        content={
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <span className="text-[var(--muted)]">Entities</span>
              <div className="font-mono font-medium">{inv.entities?.length ?? 0}</div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Connections</span>
              <div className="font-mono font-medium">{inv.connections?.length ?? 0}</div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Sources (queries)</span>
              <div className="font-mono font-medium">{inv.search_history?.length ?? 0}</div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Iterations</span>
              <div className="font-mono font-medium">
                {inv.iteration}/{inv.max_iterations}
              </div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Cost</span>
              <div className="font-mono font-medium">
                ${(inv.estimated_cost_usd ?? inv.run_metadata?.total_cost_usd ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Duration</span>
              <div className="font-mono font-medium">
                {inv.run_metadata?.duration_seconds != null && inv.run_metadata.duration_seconds > 0
                  ? `${Math.floor(inv.run_metadata.duration_seconds / 60)}m ${Math.round(inv.run_metadata.duration_seconds % 60)}s`
                  : "—"}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="text-[var(--muted)]">Phase</span> {inv.current_phase} · LLM calls:{" "}
              {inv.total_llm_calls} · Search calls: {inv.total_search_calls}
            </div>
          </div>
        }
      />
    </div>
  );
}
