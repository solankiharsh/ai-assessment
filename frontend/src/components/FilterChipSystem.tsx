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
            ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
            : "border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--muted)] hover:text-[var(--foreground)]"
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
              ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
              : "border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--muted)] hover:text-[var(--foreground)]"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}