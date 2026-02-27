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
      ? "bg-[var(--risk-low)]/15 text-[var(--risk-low)] border-[var(--risk-low)]/30"
      : tier === "medium"
        ? "bg-[var(--risk-medium)]/15 text-[var(--risk-medium)] border-[var(--risk-medium)]/30"
        : tier === "low"
          ? "bg-[var(--risk-high)]/15 text-[var(--risk-high)] border-[var(--risk-high)]/30"
          : "bg-[var(--bg-card)] text-[var(--muted)] border-[var(--border)]";

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex rounded-md border font-mono font-semibold",
          color,
          size === "small" ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
        )}
      >
        {pct}%
      </span>
      {label && (
        <span className="text-xs text-[var(--muted)]">{label}</span>
      )}
    </div>
  );
}
