"use client";

import type { EntityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ENTITY_SHAPES: Record<EntityType, string> = {
  person: "●",
  organization: "⬡",
  location: "◆",
  event: "◇",
  document: "▢",
  financial_instrument: "▣",
};

export function GraphLegend({
  onFilter,
  activeType,
  className,
}: {
  onFilter?: (type: EntityType | null) => void;
  activeType?: EntityType | null;
  className?: string;
}) {
  const types = Object.keys(ENTITY_SHAPES) as EntityType[];

  return (
    <div
      className={cn(
        "rounded border border-[var(--border)] bg-[var(--bg-card)] p-2 text-xs",
        className
      )}
    >
      <div className="mb-1.5 font-medium uppercase tracking-wider text-[var(--muted)]">
        Entity types
      </div>
      <ul className="space-y-1">
        {types.map((t) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => onFilter?.(activeType === t ? null : t)}
              className={cn(
                "flex items-center gap-2 rounded px-1.5 py-0.5 w-full text-left",
                activeType === t
                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
              )}
            >
              <span className="font-mono text-sm">{ENTITY_SHAPES[t]}</span>
              <span className="capitalize">{t.replace(/_/g, " ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}