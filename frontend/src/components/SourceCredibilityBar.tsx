"use client";

import { cn } from "@/lib/utils";

export function SourceCredibilityBar({
  score,
  label,
  className,
}: {
  score: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const color =
    pct >= 0.7 ? "bg-emerald-500" : pct >= 0.4 ? "bg-amber-500" : "bg-zinc-500";

  return (
    <div className={cn("space-y-0.5", className)}>
      {label && (
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>{label}</span>
          <span className="font-mono">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}