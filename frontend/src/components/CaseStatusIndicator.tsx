"use client";

import { cn } from "@/lib/utils";

type Status = "running" | "complete" | "failed" | undefined;

const styles: Record<NonNullable<Status>, string> = {
  running: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
  complete: "bg-[var(--risk-low)]/15 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  failed: "bg-[var(--risk-critical)]/15 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
};

const labels: Record<NonNullable<Status>, string> = {
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};

export function CaseStatusIndicator({
  status,
  small,
}: {
  status?: Status;
  small?: boolean;
}) {
  const s = status ?? "complete";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium",
        styles[s],
        small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      )}
    >
      {labels[s]}
    </span>
  );
}
