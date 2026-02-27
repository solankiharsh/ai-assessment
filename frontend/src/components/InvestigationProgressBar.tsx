"use client";

import { cn } from "@/lib/utils";

export function InvestigationProgressBar({
  iteration,
  maxIterations,
  phase,
  status,
  className,
}: {
  iteration: number;
  maxIterations: number;
  phase: string;
  status: "running" | "complete" | "failed";
  className?: string;
}) {
  const pct = maxIterations > 0 ? (iteration / maxIterations) * 100 : 0;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>
          {phase.replace(/_/g, " ")} · {iteration}/{maxIterations}
        </span>
        <span className="capitalize">{status}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className={cn(
            "h-full transition-all duration-300",
            status === "complete" && "bg-emerald-500",
            status === "failed" && "bg-red-500",
            status === "running" && "bg-amber-500"
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}