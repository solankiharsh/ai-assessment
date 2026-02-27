"use client";

import { useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { PanelRightClose } from "lucide-react";
import { IntelligenceReport } from "../IntelligenceReport";
import { HypothesisPanel } from "../HypothesisPanel";
import { InvestigationTimeline } from "../InvestigationTimeline";
import type { Investigation } from "@/lib/types";
import { cn } from "@/lib/utils";

function ConfidenceThresholdSlider() {
  const value = useUIStore((s) => s.confidenceThreshold);
  const set = useUIStore((s) => s.setConfidenceThreshold);
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        Confidence threshold
      </h3>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={value}
          onChange={(e) => set(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="w-8 text-right font-mono text-xs text-[var(--muted)]">
          {Math.round(value * 100)}%
        </span>
      </div>
    </section>
  );
}

interface RightPanelProps {
  caseId?: string | null;
  caseData?: Investigation | null;
}

export function RightPanel({ caseId, caseData }: RightPanelProps) {
  const setRightOpen = useUIStore((s) => s.setRightPanelOpen);
  const inv = caseData;
  const [mode, setMode] = useState<"summary" | "report">("summary");

  return (
    <div
      className={cn(
        "console-panel flex h-full w-full flex-col bg-[var(--bg-secondary)]",
        "animate-slide-in"
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Investigation Intel
          </div>
          {inv && (
            <div className="truncate text-sm font-medium text-[var(--foreground)]">
              {inv.target}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRightOpen(false)}
          className="shrink-0 rounded p-1 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
          aria-label="Collapse panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {inv && (
        <div className="mb-2 flex gap-1 border-b border-[var(--border)] p-2">
          <button
            type="button"
            onClick={() => setMode("summary")}
            className={cn(
              "flex-1 rounded px-2 py-1.5 text-xs font-medium",
              mode === "summary"
                ? "bg-[var(--bg-card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--bg-hover)]"
            )}
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setMode("report")}
            className={cn(
              "flex-1 rounded px-2 py-1.5 text-xs font-medium",
              mode === "report"
                ? "bg-[var(--bg-card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--bg-hover)]"
            )}
          >
            Report
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {inv && mode === "summary" && (
          <div className="space-y-4">
            <IntelligenceReport investigation={inv} mode="summary" />
            {inv.hypotheses && inv.hypotheses.length > 0 && (
              <HypothesisPanel hypotheses={inv.hypotheses} maxItems={5} />
            )}
            {(inv.search_history?.length ?? 0) > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Timeline
                </h3>
                <InvestigationTimeline
                  searchHistory={inv.search_history}
                  maxItems={8}
                />
              </section>
            )}
            <ConfidenceThresholdSlider />
          </div>
        )}
        {inv && mode === "report" && (
          <IntelligenceReport investigation={inv} mode="report" />
        )}
        {!inv && caseId && (
          <div className="text-sm text-[var(--muted)]">
            Load case to see risk, confidence, and timeline.
          </div>
        )}
        {!caseId && (
          <div className="text-sm text-[var(--muted)]">
            Open a case to view contextual insight.
          </div>
        )}
      </div>
    </div>
  );
}
