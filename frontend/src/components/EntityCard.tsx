"use client";

import type { Entity, Connection, RiskFlag } from "@/lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { cn } from "@/lib/utils";

interface EntityCardProps {
  entity: Entity;
  connections?: Connection[];
  riskFlags?: RiskFlag[];
  onSelect?: () => void;
  selected?: boolean;
  compact?: boolean;
}

export function EntityCard({
  entity,
  connections = [],
  riskFlags = [],
  onSelect,
  selected,
  compact,
}: EntityCardProps) {
  const relatedRisks = riskFlags.filter((r) =>
    r.entity_ids?.includes(entity.id)
  );
  const outConnections = connections.filter((c) => c.source_entity_id === entity.id);
  const inConnections = connections.filter((c) => c.target_entity_id === entity.id);

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => onSelect && (e.key === "Enter" || e.key === " ") && onSelect()}
      className={cn(
        "rounded border bg-zinc-900/80 p-3 text-left transition-colors",
        selected
          ? "border-amber-500/60 bg-zinc-800/80"
          : "border-[var(--border)] hover:border-zinc-600",
        compact && "p-2"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100 truncate">{entity.name}</span>
            <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
              {entity.entity_type}
            </span>
          </div>
          {entity.description && !compact && (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {entity.description}
            </p>
          )}
        </div>
        <ConfidenceBadge value={entity.confidence} size="small" />
      </div>
      {!compact && (
        <>
          {(outConnections.length > 0 || inConnections.length > 0) && (
            <div className="mt-2 text-xs text-zinc-500">
              {outConnections.length} out · {inConnections.length} in
            </div>
          )}
          {relatedRisks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {relatedRisks.slice(0, 3).map((r) => (
                <span
                  key={r.id}
                  className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400"
                >
                  {r.severity}
                </span>
              ))}
            </div>
          )}
          {entity.source_urls?.length > 0 && (
            <div className="mt-2 text-[10px] text-zinc-500">
              {entity.source_urls.length} source(s)
            </div>
          )}
        </>
      )}
    </div>
  );
}
