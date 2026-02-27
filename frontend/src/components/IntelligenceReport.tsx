"use client";

import type { Investigation } from "@/lib/types";
import { SuggestedActions } from "./SuggestedActions";
import { ReportMarkdownView } from "./ReportMarkdownView";
import { cn } from "@/lib/utils";

function getSeverityTier(riskScore: number) {
  if (riskScore >= 80) return { label: "CRITICAL", color: "var(--risk-critical)" };
  if (riskScore >= 50) return { label: "HIGH", color: "var(--risk-high)" };
  if (riskScore >= 25) return { label: "MEDIUM", color: "var(--risk-medium)" };
  if (riskScore > 0) return { label: "LOW", color: "var(--risk-low)" };
  return { label: "CLEAR", color: "var(--risk-low)" };
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-sm font-semibold",
          danger ? "text-[var(--risk-high)]" : "text-[var(--foreground)]"
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
  const uniqueUrls = new Set(
    (inv.entities ?? [])
      .flatMap((e) => e.source_urls ?? [])
      .concat((inv.search_history ?? []).flatMap((s) => s.result_urls ?? []))
  ).size;
  const riskCategories =
    new Set(inv.risk_flags?.map((r) => r.category) ?? []).size;
  const openHypotheses =
    inv.hypotheses?.filter((h) => h.status === "open").length ?? 0;

  if (mode === "report") {
    const subjectName = inv.subject?.full_name ?? inv.target ?? "Subject";
    const reportDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const classification =
      inv.report_risk_level === "clear" || !inv.report_risk_level
        ? "Low / None"
        : (inv.report_risk_level ?? "clear").toUpperCase();
    const body = inv.final_report?.trim() || "No report generated yet.";
    // If report doesn't start with a top-level heading, prepend structured header (reference style)
    const hasTitle = /^\s*#\s+/m.test(body);
    const reportContent = hasTitle
      ? body
      : `# EXECUTIVE DUE DILIGENCE REPORT

## Subject: ${subjectName}

**Report Date:** ${reportDate}
**Classification:** ${inv.report_risk_level ? `${classification} RISK` : classification}

---

## 1. EXECUTIVE SUMMARY

${body}`;
    return (
      <ReportMarkdownView
        content={reportContent}
        className="rounded-2xl"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk summary card */}
      <div
        className="rounded-lg border p-3"
        style={{
          borderColor: `${tier.color}40`,
          backgroundColor: `${tier.color}08`,
        }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: tier.color }}
        >
          {tier.label}
        </div>
        <div className="mt-1 text-[11px] text-[var(--muted)]">
          {riskScore > 0
            ? "Review risk flags for details"
            : "No significant risks identified"}
        </div>
        <div className="mt-2 font-mono text-sm font-bold" style={{ color: tier.color }}>
          {riskScore}
        </div>
      </div>

      {/* Subject info */}
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
              .join(" at ")}
          </div>
        )}
      </section>

      {/* Key findings */}
      {(inv.risk_flags?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Key findings
          </h3>
          <ul className="space-y-1.5">
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

      {/* Metrics */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Scope
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MiniCard label="Entities" value={inv.entities?.length ?? 0} />
          <MiniCard label="Connections" value={inv.connections?.length ?? 0} />
          <MiniCard label="Sources" value={uniqueUrls} />
          <MiniCard
            label="Est. cost"
            value={`$${(inv.estimated_cost_usd ?? 0).toFixed(2)}`}
          />
        </div>
      </section>

      <SuggestedActions investigation={inv} />
    </div>
  );
}
