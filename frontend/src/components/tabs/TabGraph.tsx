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
  const topConnected = useMemo(() => {
    const insight = inv.graph_insights?.find((i) => i.type === "degree_centrality");
    const data = insight?.data as { name?: string; degree?: number }[] | undefined;
    const first = data?.[0];
    return first?.name != null && first?.degree != null
      ? { name: first.name, degree: first.degree }
      : null;
  }, [inv.graph_insights]);

  return (
    <div className="relative flex h-full min-h-[400px] flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-xs font-medium text-neutral-200">
          Identity Network — zoom, pan, click a node for details; edges show relationship type
        </span>
        {topConnected && (
          <span className="text-[11px] text-neutral-300">
            Most connected: {topConnected.name} ({topConnected.degree} links)
          </span>
        )}
        <span
          className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-neutral-400"
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