"use client";

import type { Investigation, RiskFlag, SearchRecord } from "@/lib/types";
import { ExpandableReasoningBlock } from "../ExpandableReasoningBlock";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { formatRelativeTime, domainFromUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_STYLES: Record<
  string,
  { border: string; bg: string; text: string; accent: string }
> = {
  critical: {
    border: "border-l-[var(--risk-critical)]",
    bg: "bg-[var(--risk-critical)]/5",
    text: "text-[var(--risk-critical)]",
    accent: "var(--risk-critical)",
  },
  high: {
    border: "border-l-[var(--risk-high)]",
    bg: "bg-[var(--risk-high)]/5",
    text: "text-[var(--risk-high)]",
    accent: "var(--risk-high)",
  },
  medium: {
    border: "border-l-[var(--risk-medium)]",
    bg: "bg-[var(--risk-medium)]/5",
    text: "text-[var(--risk-medium)]",
    accent: "var(--risk-medium)",
  },
  low: {
    border: "border-l-[var(--risk-low)]",
    bg: "bg-[var(--risk-low)]/5",
    text: "text-[var(--risk-low)]",
    accent: "var(--risk-low)",
  },
  info: {
    border: "border-l-[var(--risk-info)]",
    bg: "bg-[var(--risk-info)]/5",
    text: "text-[var(--risk-info)]",
    accent: "var(--risk-info)",
  },
};

function RiskFlagCard({ flag }: { flag: RiskFlag }) {
  const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className="rounded-lg border border-[var(--border)] border-l-4 bg-[var(--bg-card)] p-4"
      style={{ borderLeftColor: style.accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {flag.title}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              style={{
                backgroundColor: `${style.accent}20`,
                color: style.accent,
              }}
            >
              {flag.severity}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-300">
            {flag.description}
          </p>
        </div>
        <ConfidenceBadge value={flag.confidence} size="small" />
      </div>

      {flag.mitigating_factors?.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5">
          <div className="text-[11px] font-medium uppercase text-neutral-400">
            Mitigating factors
          </div>
          <p className="mt-0.5 text-xs text-neutral-300">
            {flag.mitigating_factors.join("; ")}
          </p>
        </div>
      )}

      {flag.evidence?.length > 0 && (
        <ExpandableReasoningBlock
          title={`Evidence (${flag.evidence.length} source${flag.evidence.length !== 1 ? "s" : ""})`}
          defaultOpen={false}
          className="mt-3"
          content={
            <ul className="space-y-1 text-xs">
              {flag.evidence.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 hover:text-orange-300 hover:underline"
                  >
                    {domainFromUrl(url)}
                  </a>
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}

export function TabRisk({
  investigation: inv,
}: {
  investigation: Investigation;
}) {
  const flags = inv.risk_flags ?? [];
  const reportFindings = inv.report_risk_findings ?? [];
  const reportRiskLevel = inv.report_risk_level;

  if (flags.length === 0 && reportFindings.length === 0 && !reportRiskLevel) {
    const adversarialSearches = (inv.search_history ?? []).filter(
      (r: SearchRecord) => (r.phase ?? "").toLowerCase() === "adversarial"
    );

    return (
      <div className="space-y-6 p-5">
        <div className="rounded-lg border border-[var(--risk-low)]/30 bg-[var(--risk-low)]/5 p-4">
          <div className="text-sm font-medium text-[var(--risk-low)]">
            No risk flags identified
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The adversarial analysis phase did not produce any risk flags for
            this subject.
          </p>
        </div>

        {adversarialSearches.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              Adversarial search context
            </h3>
            <ul className="space-y-2">
              {adversarialSearches.map((r: SearchRecord, i: number) => (
                <li
                  key={`${r.iteration}-${r.timestamp}-${i}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-[var(--foreground)]">
                      {r.query}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {formatRelativeTime(r.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span>{r.provider}</span>
                    <span>{r.num_results} results</span>
                    {r.was_useful !== undefined && (
                      <span>{r.was_useful ? "Useful" : "Not useful"}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {adversarialSearches.length === 0 && (
          <p className="text-xs text-[var(--muted)]">
            Run the pipeline with enough iterations for adversarial searches
            and risk analysis to execute.
          </p>
        )}
      </div>
    );
  }

  // Show report-extracted findings when structured flags are empty
  if (flags.length === 0 && (reportFindings.length > 0 || reportRiskLevel)) {
    const riskLevelColor: Record<string, string> = {
      critical: "var(--risk-critical)",
      high: "var(--risk-high)",
      medium: "var(--risk-medium)",
      low: "var(--risk-low)",
      clear: "var(--risk-low)",
    };
    const levelColor = riskLevelColor[reportRiskLevel ?? "medium"] ?? "var(--risk-info)";

    return (
      <div className="space-y-6 p-5">
        {/* Overall risk classification from report */}
        {reportRiskLevel && (
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: `${levelColor}40`,
              backgroundColor: `${levelColor}08`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-xs font-bold uppercase"
                style={{ backgroundColor: `${levelColor}20`, color: levelColor }}
              >
                {reportRiskLevel} risk
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                Classification extracted from investigation report
              </span>
            </div>
          </div>
        )}

        {/* Extracted risk findings */}
        {reportFindings.length > 0 && (
          <>
            <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {reportFindings.length} risk finding{reportFindings.length !== 1 ? "s" : ""} identified
              </span>
              <span className="text-xs text-[var(--muted)]">
                Extracted from report analysis
              </span>
            </div>

            <div className="space-y-3">
              {reportFindings.map((r, i) => {
                const sStyle = SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.info;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border)] border-l-4 bg-[var(--bg-card)] p-4"
                    style={{ borderLeftColor: sStyle.accent }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {r.title}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          backgroundColor: `${sStyle.accent}20`,
                          color: sStyle.accent,
                        }}
                      >
                        {r.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {r.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // Sort flags by severity
  const sorted = [...flags].sort((a, b) => {
    const ai = SEVERITY_ORDER.indexOf(
      a.severity as (typeof SEVERITY_ORDER)[number]
    );
    const bi = SEVERITY_ORDER.indexOf(
      b.severity as (typeof SEVERITY_ORDER)[number]
    );
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Summary stats
  const criticalCount = flags.filter((f) => f.severity === "critical").length;
  const highCount = flags.filter((f) => f.severity === "high").length;
  const mediumCount = flags.filter((f) => f.severity === "medium").length;
  const lowCount = flags.filter(
    (f) => f.severity === "low" || f.severity === "info"
  ).length;

  return (
    <div className="space-y-6 p-5">
      {/* Summary bar */}
      <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {flags.length} risk flag{flags.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-3 text-xs">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-[var(--risk-critical)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--risk-critical)]" />
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="flex items-center gap-1 text-[var(--risk-high)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--risk-high)]" />
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="flex items-center gap-1 text-[var(--risk-medium)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--risk-medium)]" />
              {mediumCount} medium
            </span>
          )}
          {lowCount > 0 && (
            <span className="flex items-center gap-1 text-[var(--risk-low)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--risk-low)]" />
              {lowCount} low
            </span>
          )}
        </div>
      </div>

      {/* Risk flag cards */}
      <div className="space-y-3">
        {sorted.map((r) => (
          <RiskFlagCard key={r.id} flag={r} />
        ))}
      </div>

      {/* Timeline anomalies (temporal contradictions) */}
      {(inv.temporal_contradictions?.length ?? 0) > 0 && (
        <ExpandableReasoningBlock
          title={`Timeline anomalies (${inv.temporal_contradictions!.length})`}
          defaultOpen={true}
          content={
            <ul className="space-y-2">
              {inv.temporal_contradictions!.map((c) => {
                const sStyle = SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.medium;
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "rounded-lg border border-l-4 bg-[var(--bg-card)] p-3",
                      sStyle.border
                    )}
                    style={{ borderLeftColor: sStyle.accent }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          backgroundColor: `${sStyle.accent}20`,
                          color: sStyle.accent,
                        }}
                      >
                        {c.severity}
                      </span>
                      <ConfidenceBadge value={c.confidence} size="small" />
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{c.description}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      Facts: {c.fact_a_id} / {c.fact_b_id}
                    </p>
                  </li>
                );
              })}
            </ul>
          }
        />
      )}

      {/* Risk debate transcript */}
      <ExpandableReasoningBlock
        title="Risk debate transcript"
        defaultOpen={false}
        content={
          (inv.risk_debate_transcript?.length ?? 0) > 0 ? (
            <ul className="space-y-2 text-sm">
              {inv.risk_debate_transcript!.map((entry, i) => {
                const role = (entry.role ?? "").toLowerCase();
                const isProponent = role.includes("proponent");
                const isSkeptic = role.includes("skeptic");
                const isJudge = role.includes("judge");
                const borderClass = isProponent
                  ? "border-l-amber-500"
                  : isSkeptic
                    ? "border-l-blue-500"
                    : isJudge
                      ? "border-l-green-500 bg-[var(--risk-low)]/5"
                      : "border-l-[var(--border)]";
                return (
                  <li
                    key={i}
                    className={cn(
                      "rounded border-l-4 border-[var(--border)] bg-[var(--bg-card)] p-3",
                      borderClass
                    )}
                  >
                    <span className="text-[10px] font-medium uppercase text-[var(--muted)]">
                      {entry.role}
                      {entry.timestamp ? ` · ${entry.timestamp}` : ""}
                    </span>
                    <p className="mt-1 text-[var(--text-secondary)]">{entry.argument}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Risk debate transcript is generated during adversarial analysis. Run with more
              iterations to enable.
            </p>
          )
        }
      />

      {/* Graph insights */}
      {(inv.graph_insights?.length ?? 0) > 0 && (
        <ExpandableReasoningBlock
          title="Graph insights"
          defaultOpen={false}
          content={
            <div className="space-y-4">
              {inv.graph_insights!.map((insight, i) => {
                if (insight.type === "degree_centrality" && Array.isArray(insight.data)) {
                  const rows = insight.data as { name?: string; degree?: number }[];
                  return (
                    <div key={i}>
                      <h4 className="mb-2 text-xs font-medium uppercase text-[var(--muted)]">
                        Degree centrality (top connected)
                      </h4>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="py-1.5 font-medium">Name</th>
                            <th className="py-1.5 font-medium">Links</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 10).map((row, j) => (
                            <tr key={j} className="border-b border-[var(--border)]/50">
                              <td className="py-1.5">{row.name ?? "—"}</td>
                              <td className="font-mono">{row.degree ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
                if (insight.type === "shell_companies" && Array.isArray(insight.data)) {
                  return (
                    <div key={i}>
                      <h4 className="mb-2 text-xs font-medium uppercase text-[var(--muted)]">
                        Shell company detections
                      </h4>
                      <pre className="overflow-auto rounded bg-[var(--bg-hover)] p-2 text-xs">
                        {JSON.stringify(insight.data, null, 2)}
                      </pre>
                    </div>
                  );
                }
                return (
                  <div key={i}>
                    <h4 className="mb-2 text-xs font-medium uppercase text-[var(--muted)]">
                      {insight.type}
                    </h4>
                    <pre className="overflow-auto rounded bg-[var(--bg-hover)] p-2 text-xs">
                      {JSON.stringify(insight.data, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          }
        />
      )}
    </div>
  );
}
