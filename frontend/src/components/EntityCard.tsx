"use client";

import type { Entity, Connection, RiskFlag } from "@/lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  person: "var(--entity-person)",
  organization: "var(--entity-org)",
  location: "var(--entity-location)",
  event: "var(--entity-event)",
  document: "var(--entity-document)",
  financial_instrument: "var(--entity-financial)",
};

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
  const outConnections = connections.filter(
    (c) => c.source_entity_id === entity.id
  );
  const inConnections = connections.filter(
    (c) => c.target_entity_id === entity.id
  );
  const typeColor = TYPE_COLORS[entity.entity_type] ?? "var(--muted)";

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) =>
        onSelect && (e.key === "Enter" || e.key === " ") && onSelect()
      }
      className={cn(
        "rounded-lg border bg-[var(--bg-card)] p-3 text-left transition-all",
        selected
          ? "border-[var(--accent)] bg-[var(--bg-hover)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]",
        compact && "p-2",
        onSelect && "cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--foreground)]">
              {entity.name}
            </span>
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase"
              style={{
                backgroundColor: `${typeColor}15`,
                color: typeColor,
              }}
            >
              {entity.entity_type.replace(/_/g, " ")}
            </span>
            {compact && (
              <span className="text-[10px] font-mono text-neutral-400">
                {Math.round(entity.confidence * 100)}%
              </span>
            )}
          </div>
          {entity.description && !compact && (
            <p className="mt-1 line-clamp-2 text-xs text-neutral-400">
              {entity.description}
            </p>
          )}
          {entity.description && compact && (
            <p className="mt-0.5 truncate text-[11px] text-neutral-400" title={entity.description}>
              {entity.description.length > 70 ? `${entity.description.slice(0, 70)}…` : entity.description}
            </p>
          )}
        </div>
        {!compact && <ConfidenceBadge value={entity.confidence} size="small" />}
      </div>
      {!compact && (
        <>
          {(outConnections.length > 0 || inConnections.length > 0) && (
            <div className="mt-2 text-xs text-neutral-400">
              {outConnections.length} outgoing · {inConnections.length} incoming
            </div>
          )}
          {relatedRisks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {relatedRisks.slice(0, 3).map((r) => {
                const sColors: Record<string, string> = {
                  critical: "var(--risk-critical)",
                  high: "var(--risk-high)",
                  medium: "var(--risk-medium)",
                  low: "var(--risk-low)",
                };
                const c = sColors[r.severity] ?? "var(--risk-info)";
                return (
                  <span
                    key={r.id}
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${c}20`, color: c }}
                  >
                    {r.severity}
                  </span>
                );
              })}
            </div>
          )}
          {entity.source_urls?.length > 0 && (
            <div className="mt-2 text-[10px] text-neutral-400">
              {entity.source_urls.length} source
              {entity.source_urls.length !== 1 ? "s" : ""}
            </div>
          )}
        </>
      )}
    </div>
  );
}
