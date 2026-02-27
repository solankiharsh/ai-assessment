"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConflictIndicator({
  count,
  compact,
  className,
}: {
  count: number;
  compact?: boolean;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded bg-[var(--risk-medium)]/20 text-[var(--risk-medium)]",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{count} conflict{count !== 1 ? "s" : ""}</span>
    </div>
  );
}