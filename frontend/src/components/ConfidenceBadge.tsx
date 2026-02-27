"use client";

import { cn } from "@/lib/utils";

export function ConfidenceBadge({
  value,
  label,
  size = "default",
}: {
  value: number;
  label?: string;
  size?: "small" | "default";
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tier =
    pct >= 80 ? "high" : pct >= 50 ? "medium" : pct >= 20 ? "low" : "none";
  const color =
    tier === "high"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
      : tier === "medium"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
        : tier === "low"
          ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
          : "bg-zinc-700/50 text-zinc-500 border-zinc-600";

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex rounded border font-mono font-medium",
          color,
          size === "small" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"
        )}
      >
        {pct}%
      </span>
      {label && (
        <span className="text-xs text-zinc-500">{label}</span>
      )}
    </div>
  );
}
