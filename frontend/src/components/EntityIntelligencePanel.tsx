"use client";

import { X } from "lucide-react";
import type { Entity, Investigation, RiskFlag } from "@/lib/types";
import { cn } from "@/lib/utils";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: "PERSON",
  organization: "ORGANIZATION",
  location: "LOCATION",
  event: "EVENT",
  document: "DOCUMENT",
  financial_instrument: "FINANCIAL",
};

const TYPE_COLORS: Record<string, string> = {
  person: "var(--entity-person)",
  organization: "var(--entity-org)",
  location: "var(--entity-location)",
  event: "var(--entity-event)",
  document: "var(--entity-document)",
  financial_instrument: "var(--entity-financial)",
};

interface EntityIntelligencePanelProps {
  entity: Entity;
  investigation: Investigation;
  onClose: () => void;
}

function getEntityRiskScore(entityId: string, riskFlags: RiskFlag[]): "HIGH" | "MEDIUM" | "LOW" | null {
  const flags = riskFlags.filter((f) => f.entity_ids?.includes(entityId));
  if (flags.length === 0) return null;
  const hasCritical = flags.some((f) => f.severity === "critical");
  const hasHigh = flags.some((f) => f.severity === "high");
  if (hasCritical || hasHigh) return "HIGH";
  if (flags.some((f) => f.severity === "medium")) return "MEDIUM";
  return "LOW";
}

export function EntityIntelligencePanel({
  entity,
  investigation,
  onClose,
}: EntityIntelligencePanelProps) {
  const connectionsOut = (investigation.connections ?? []).filter(
    (c) => c.source_entity_id === entity.id
  );
  const connectionsIn = (investigation.connections ?? []).filter(
    (c) => c.target_entity_id === entity.id
  );
  const connectionCount = connectionsOut.length + connectionsIn.length;
  const riskScore = getEntityRiskScore(entity.id, investigation.risk_flags ?? []);
  const typeColor = TYPE_COLORS[entity.entity_type] ?? "var(--muted)";
  const typeLabel = ENTITY_TYPE_LABELS[entity.entity_type] ?? entity.entity_type.toUpperCase();

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Entity intelligence
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">
        <div className="mb-3 text-center">
          <div className="mx-auto mb-2 h-16 w-16 rounded-full bg-[var(--bg-secondary)]" />
          <h4 className="text-base font-bold text-[var(--foreground)]">
            {entity.name}
          </h4>
          <span
            className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase"
            style={{
              backgroundColor: `${typeColor}20`,
              color: typeColor,
            }}
          >
            {typeLabel}
          </span>
        </div>

        {entity.description && (
          <section className="mb-3">
            <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Background intelligence
            </h5>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              {entity.description}
            </p>
          </section>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Connections
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold text-[var(--foreground)]">
              {connectionCount}
            </div>
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Risk score
            </div>
            <div
              className={cn(
                "mt-0.5 font-mono text-lg font-bold",
                riskScore === "HIGH" && "text-[var(--risk-high)]",
                riskScore === "MEDIUM" && "text-[var(--risk-medium)]",
                riskScore === "LOW" && "text-[var(--risk-low)]",
                !riskScore && "text-[var(--muted)]"
              )}
            >
              {riskScore ?? "—"}
            </div>
          </div>
        </div>

        <section className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
          <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Network overview
          </h5>
          <div className="text-[10px] text-[var(--text-secondary)]">
            Total entities: {(investigation.entities ?? []).length} · Active connections:{" "}
            {(investigation.connections ?? []).length}
          </div>
        </section>
      </div>
    </div>
  );
}
