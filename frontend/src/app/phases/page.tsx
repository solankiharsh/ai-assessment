"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { PhaseExplainer } from "@/components/PhaseExplainer";
import { api } from "@/lib/api";
import type { SearchPhase } from "@/lib/types";

export default function PhasesPage() {
  const [selectedPhase, setSelectedPhase] = useState<SearchPhase | null>("baseline");

  const { data: casesData } = useQuery({
    queryKey: ["cases"],
    queryFn: () => api.listCases(),
  });
  const cases = casesData?.cases ?? [];
  const caseIds = useMemo(
    () => cases.slice(0, 5).map((c) => c.id),
    [cases]
  );

  const caseQueries = useQueries({
    queries: caseIds.map((id) => ({
      queryKey: ["case", id],
      queryFn: () => api.getCase(id),
    })),
  });

  const phaseStats = useMemo(() => {
    const counts: Record<SearchPhase, number> = {
      baseline: 0,
      breadth: 0,
      depth: 0,
      adversarial: 0,
      triangulation: 0,
      synthesis: 0,
    };
    for (const res of caseQueries) {
      const inv = res.data;
      if (!inv?.search_history) continue;
      for (const r of inv.search_history) {
        const p = r.phase as SearchPhase;
        if (p && counts[p] != null) counts[p] += 1;
      }
    }
    return counts;
  }, [caseQueries]);

  return (
    <div className="h-full">
      <PhaseExplainer
        selectedPhase={selectedPhase}
        onSelectPhase={setSelectedPhase}
        phaseStats={phaseStats}
      />
    </div>
  );
}
