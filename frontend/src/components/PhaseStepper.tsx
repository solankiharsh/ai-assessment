"use client";

import type { SearchPhase } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const PHASES: { id: SearchPhase; label: string; activeLabel: string }[] = [
  { id: "baseline", label: "Baseline", activeLabel: "Establishing baseline..." },
  { id: "breadth", label: "Breadth", activeLabel: "Expanding search..." },
  { id: "depth", label: "Depth", activeLabel: "Deep analysis..." },
  { id: "adversarial", label: "Adversarial", activeLabel: "Stress testing..." },
  { id: "triangulation", label: "Triangulation", activeLabel: "Cross-referencing..." },
  { id: "synthesis", label: "Synthesis", activeLabel: "Generating report..." },
];

const PHASE_ORDER: Record<SearchPhase, number> = {
  baseline: 0,
  breadth: 1,
  depth: 2,
  adversarial: 3,
  triangulation: 4,
  synthesis: 5,
};

export function PhaseStepper({
  currentPhase,
  status,
  className,
}: {
  currentPhase: SearchPhase;
  status: "running" | "complete" | "failed";
  className?: string;
}) {
  const currentIdx = PHASE_ORDER[currentPhase] ?? 0;
  const isComplete = status === "complete";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {PHASES.map((phase, idx) => {
        const isDone = isComplete || idx < currentIdx;
        const isActive = !isComplete && idx === currentIdx;
        const isPending = !isComplete && idx > currentIdx;

        return (
          <div key={phase.id} className="flex items-center gap-1">
            {idx > 0 && (
              <div
                className={cn(
                  "h-px w-4",
                  isDone ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
                  isDone && "bg-[var(--accent)] text-white",
                  isActive &&
                    "border-2 border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]",
                  isPending && "border border-[var(--border)] text-[var(--muted)]"
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : idx + 1}
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium lg:inline",
                  isDone && "text-[var(--text-secondary)]",
                  isActive && "text-[var(--foreground)]",
                  isPending && "text-[var(--muted)]"
                )}
              >
                {isActive ? phase.activeLabel : phase.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
