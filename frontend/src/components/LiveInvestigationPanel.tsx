"use client";

import { useMemo } from "react";
import type { LiveProgressEvent } from "@/components/tabs/TabEvidence";
import { cn } from "@/lib/utils";

// ── Phase config matching src/main.py _PHASE_CONFIG ───────────────────────────
const PHASES = [
    { id: "baseline", label: "Baseline", emoji: "🔍" },
    { id: "breadth", label: "Breadth", emoji: "🌐" },
    { id: "depth", label: "Depth", emoji: "🔬" },
    { id: "adversarial", label: "Adversarial", emoji: "⚔️" },
    { id: "triangulation", label: "Triangulation", emoji: "🔺" },
    { id: "synthesis", label: "Synthesis", emoji: "📋" },
];

const PHASE_ORDER: Record<string, number> = Object.fromEntries(
    PHASES.map((p, i) => [p.id, i])
);

interface LiveStats {
    entities: number;
    riskFlags: number;
    progress: number;
    currentNode: string;
    currentNodeLabel: string;
    currentPhase: string;
    iteration: number;
}

function deriveStats(events: LiveProgressEvent[]): LiveStats {
    let entities = 0;
    let riskFlags = 0;
    let progress = 0;
    let currentNode = "";
    let currentNodeLabel = "";
    let currentPhase = "baseline";
    let iteration = 0;

    for (const e of events) {
        if (e.event === "node_start") {
            currentNode = e.node ?? currentNode;
            currentNodeLabel = e.label ?? currentNode;
            if (e.phase) currentPhase = e.phase;
            if (e.iteration != null) iteration = e.iteration;
            if (e.progress != null) progress = e.progress;
        } else if (e.event === "entities_update" && e.count != null) {
            entities = Math.max(entities, e.count);
        } else if (e.event === "risks_update" && e.count != null) {
            riskFlags = Math.max(riskFlags, e.count);
        } else if (e.event === "complete") {
            progress = 1.0;
            if (e.entities != null) entities = e.entities;
            if (e.risk_flags != null) riskFlags = e.risk_flags;
            if (e.iterations != null) iteration = e.iterations;
        } else if ((e.event === "node" || e.event === "search") && e.phase) {
            currentPhase = e.phase;
            if (e.iteration != null) iteration = e.iteration;
        }
    }

    return { entities, riskFlags, progress, currentNode, currentNodeLabel, currentPhase, iteration };
}

export function LiveInvestigationPanel({
    liveEvents,
    subjectName,
}: {
    liveEvents: LiveProgressEvent[];
    subjectName?: string;
}) {
    const stats = useMemo(() => deriveStats(liveEvents), [liveEvents]);

    // Last 8 log lines (log events + search queries)
    const logLines = useMemo(() => {
        return liveEvents
            .filter((e) => e.event === "log" || (e.event === "search" && e.query))
            .slice(-8)
            .map((e) =>
                e.event === "search" ? `🔎 ${e.phase ?? ""}: ${e.query}` : (e.message ?? "")
            )
            .filter(Boolean);
    }, [liveEvents]);

    const currentPhaseIdx = PHASE_ORDER[stats.currentPhase] ?? 0;
    const progressPct = Math.round(stats.progress * 100);

    return (
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 space-y-3">
            {/* Header: pulsing indicator + active node + counters */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Pulsing dot */}
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent)]" />
                    </span>
                    <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                        Investigating{subjectName ? ` ${subjectName}` : ""}
                    </span>
                    {stats.currentNodeLabel && (
                        <span className="shrink-0 rounded bg-[var(--bg-hover)] px-2 py-0.5 text-[10px] text-[var(--muted)] font-mono">
                            {stats.currentNodeLabel}
                        </span>
                    )}
                </div>

                {/* Real-time counters */}
                <div className="hidden items-center gap-4 text-xs sm:flex shrink-0">
                    <span className="text-[var(--muted)]">
                        Entities:{" "}
                        <span className="font-mono font-medium text-[var(--foreground)]">
                            {stats.entities}
                        </span>
                    </span>
                    <span className="text-[var(--muted)]">
                        Flags:{" "}
                        <span
                            className={cn(
                                "font-mono font-medium",
                                stats.riskFlags > 0 ? "text-[var(--risk-high)]" : "text-[var(--foreground)]"
                            )}
                        >
                            {stats.riskFlags}
                        </span>
                    </span>
                    {stats.iteration > 0 && (
                        <span className="text-[var(--muted)]">
                            Iter:{" "}
                            <span className="font-mono font-medium text-[var(--foreground)]">
                                {stats.iteration}
                            </span>
                        </span>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-700 ease-out"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)] text-right leading-none">
                    {progressPct}%
                </div>
            </div>

            {/* Phase stepper */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {PHASES.map((phase, idx) => {
                    const isActive = idx === currentPhaseIdx;
                    const isDone = idx < currentPhaseIdx;
                    return (
                        <div key={phase.id} className="flex items-center gap-1 shrink-0">
                            <div
                                className={cn(
                                    "flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-all duration-300",
                                    isActive &&
                                    "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40",
                                    isDone && "text-[var(--risk-low)] opacity-70",
                                    !isActive && !isDone && "text-[var(--muted)] opacity-50"
                                )}
                            >
                                <span>{phase.emoji}</span>
                                <span className="hidden sm:inline">{phase.label}</span>
                                {isActive && (
                                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                                )}
                            </div>
                            {idx < PHASES.length - 1 && (
                                <span className="text-[var(--border-strong)] text-[10px]">›</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Live log ticker */}
            {logLines.length > 0 && (
                <div className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono">
                    <div className="max-h-[4.5rem] overflow-hidden space-y-0.5">
                        {logLines.map((line, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "text-[10px] truncate transition-opacity duration-300",
                                    i === logLines.length - 1
                                        ? "text-[var(--foreground)]"
                                        : "text-[var(--muted)] opacity-60"
                                )}
                            >
                                {line}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
