"use client";

import { cn } from "@/lib/utils";

const BANDS = [
  { max: 20, color: "bg-emerald-500" },
  { max: 40, color: "bg-lime-500" },
  { max: 60, color: "bg-amber-500" },
  { max: 80, color: "bg-orange-500" },
  { max: 100, color: "bg-red-500" },
] as const;

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
  const band =
    BANDS.find((b) => clamped <= b.max) ?? BANDS[BANDS.length - 1];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>0</span>
        <span className="font-mono text-foreground">{Math.round(clamped)}</span>
        <span>100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className={cn("h-full transition-all duration-300", band.color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showBands && (
        <div className="flex gap-1 text-[10px] text-zinc-500">
          {BANDS.map((b, i) => (
            <span key={b.max} title={`0–${b.max}`}>
              {i === 0 ? "L" : i === BANDS.length - 1 ? "H" : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
