"use client";

import { cn } from "@/lib/utils";

export interface FilterChipOption<T extends string = string> {
  value: T;
  label: string;
}

export function FilterChipSystem<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: FilterChipOption<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          value === null
            ? "border-amber-500/60 bg-amber-500/20 text-amber-400"
            : "border-zinc-600 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
        )}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "border-amber-500/60 bg-amber-500/20 text-amber-400"
              : "border-zinc-600 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}