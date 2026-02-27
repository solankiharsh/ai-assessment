"use client";

import { cn } from "@/lib/utils";

const BANDS = [
  { max: 20, color: "bg-[var(--risk-low)]", label: "Low" },
  { max: 40, color: "bg-[var(--risk-low)]", label: "Low-Med" },
  { max: 60, color: "bg-[var(--risk-medium)]", label: "Medium" },
  { max: 80, color: "bg-[var(--risk-high)]", label: "High" },
  { max: 100, color: "bg-[var(--risk-critical)]", label: "Critical" },
] as const;

function getRiskLabel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: "Critical", color: "var(--risk-critical)" };
  if (value >= 60) return { label: "High", color: "var(--risk-high)" };
  if (value >= 40) return { label: "Medium", color: "var(--risk-medium)" };
  if (value >= 20) return { label: "Low", color: "var(--risk-low)" };
  return { label: "Clear", color: "var(--risk-low)" };
}

export function RiskMeter({
  value,
  showBands,
  className,
}: {
  value: number;
  showBands?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const band = BANDS.find((b) => clamped <= b.max) ?? BANDS[BANDS.length - 1];
  const { label, color } = getRiskLabel(clamped);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-2xl font-bold" style={{ color }}>
          {Math.round(clamped)}
        </span>
        <span className="text-xs font-medium" style={{ color }}>
          {label}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", band.color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showBands && (
        <div className="flex justify-between text-[10px] text-[var(--muted)]">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      )}
    </div>
  );
}
