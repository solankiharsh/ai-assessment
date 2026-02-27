"use client";

import { useMemo } from "react";
import type { Investigation } from "@/lib/types";
import { InvestigationGraph } from "../InvestigationGraph";
import { useUIStore } from "@/store/useUIStore";

export function TabGraph({
  caseId,
  investigation: inv,
}: {
  caseId: string;
  investigation: Investigation;
}) {
  const setSelectedEntityId = useUIStore((s) => s.setSelectedEntityId);
  const riskEntityIds = useMemo(
    () =>
      new Set(inv.risk_flags?.flatMap((r) => r.entity_ids ?? []) ?? []),
    [inv.risk_flags]
  );

  return (
    <div className="relative flex h-full min-h-[400px] flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-xs font-medium text-[var(--muted)]">
          Entity connection network — zoom, pan, click node for details
        </span>
        <span
          className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
          title="Neo4j status when backend exposes it (ADR-003)"
        >
          Graph: State-derived
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
      <InvestigationGraph
        caseId={caseId}
        onNodeSelect={(entityId) => setSelectedEntityId(entityId)}
        riskEntityIds={riskEntityIds}
      />
      </div>
    </div>
  );
}