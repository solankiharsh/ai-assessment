"use client";

import type { Investigation, TemporalFact, TemporalContradiction } from "@/lib/types";
import { ConfidenceBadge } from "../ConfidenceBadge";
import { domainFromUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  critical: {
    border: "border-[var(--risk-critical)]",
    bg: "bg-[var(--risk-critical)]/10",
    text: "text-[var(--risk-critical)]",
  },
  high: {
    border: "border-[var(--risk-high)]",
    bg: "bg-[var(--risk-high)]/10",
    text: "text-[var(--risk-high)]",
  },
  medium: {
    border: "border-[var(--risk-medium)]",
    bg: "bg-[var(--risk-medium)]/10",
    text: "text-[var(--risk-medium)]",
  },
  low: {
    border: "border-[var(--risk-low)]",
    bg: "bg-[var(--risk-low)]/10",
    text: "text-[var(--risk-low)]",
  },
  info: {
    border: "border-[var(--risk-info)]",
    bg: "bg-[var(--risk-info)]/10",
    text: "text-[var(--risk-info)]",
  },
};

function sortFactsByDate(facts: TemporalFact[]): TemporalFact[] {
  return [...facts].sort((a, b) => {
    const dateA = a.date_range?.[0] ?? a.as_of_date ?? "";
    const dateB = b.date_range?.[0] ?? b.as_of_date ?? "";
    return (dateA || "").localeCompare(dateB || "");
  });
}

export function TabTimeline({ investigation: inv }: { investigation: Investigation }) {
  const facts = inv.temporal_facts ?? [];
  const contradictions = inv.temporal_contradictions ?? [];
  const sortedFacts = sortFactsByDate(facts);

  if (facts.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Timeline analysis not available for this investigation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5">
      <header>
        <h2 className="text-sm font-semibold text-foreground">
          Temporal intelligence
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Chronological facts with date ranges and source links. Anomalies are shown below conflicting facts.
        </p>
      </header>

      <div className="relative space-y-5">
        {sortedFacts.map((fact) => {
          const linkedContradictions = contradictions.filter(
            (c) => c.fact_a_id === fact.id || c.fact_b_id === fact.id
          );
          return (
            <div key={fact.id} className="space-y-2">
              <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {fact.category || "event"}
                  </span>
                  <ConfidenceBadge value={fact.confidence} size="small" />
                </div>
                <p className="text-sm font-medium text-foreground">{fact.claim}</p>
                {(fact.date_range?.[0] ?? fact.date_range?.[1] ?? fact.as_of_date) && (
                  <p className="mt-1.5 text-xs text-foreground/80">
                    {fact.date_range?.[0] && fact.date_range?.[1]
                      ? `${fact.date_range[0]} — ${fact.date_range[1]}`
                      : fact.date_range?.[0] ?? fact.as_of_date ?? ""}
                  </p>
                )}
                {fact.source_urls?.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    {fact.source_urls.slice(0, 5).map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {domainFromUrl(url)}
                        </a>
                      </li>
                    ))}
                    {fact.source_urls.length > 5 && (
                      <li className="text-muted-foreground">+{fact.source_urls.length - 5} more</li>
                    )}
                  </ul>
                )}
              </article>
              {linkedContradictions.map((c) => {
                const style = SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.medium;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-xl border-l-4 bg-card p-4 shadow-sm",
                      style.border,
                      style.bg
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase text-destructive">
                        Anomaly detected
                      </span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", style.text)}>
                        {c.severity}
                      </span>
                      <ConfidenceBadge value={c.confidence} size="small" />
                    </div>
                    <p className="text-sm text-foreground">{c.description}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Facts: {c.fact_a_id} / {c.fact_b_id}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
