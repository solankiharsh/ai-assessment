"use client";

import { cn } from "@/lib/utils";

type Status = "running" | "complete" | "failed" | undefined;

const styles: Record<NonNullable<Status>, string> = {
  running: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  complete: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  failed: "bg-red-500/20 text-red-400 border-red-500/40",
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
        "inline-flex items-center rounded border px-1.5 font-medium",
        styles[s],
        small ? "text-[10px] px-1" : "text-xs"
      )}
    >
      {s === "running" && "Running"}
      {s === "complete" && "Complete"}
      {s === "failed" && "Failed"}
    </span>
  );
}
