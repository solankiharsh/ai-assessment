"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUIStore } from "@/store/useUIStore";
import { cn, formatRelativeTime } from "@/lib/utils";
import { PanelLeftClose, Plus, Search } from "lucide-react";
import { CaseStatusIndicator } from "../CaseStatusIndicator";
import { NewInvestigationModal } from "../NewInvestigationModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CaseSummary } from "@/lib/types";

type FilterTab = "all" | "high_risk" | "complete";

function RiskDot({ riskScore }: { riskScore?: number }) {
  const high = (riskScore ?? 0) > 50;
  const medium = (riskScore ?? 0) > 20 && (riskScore ?? 0) <= 50;
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        high && "bg-destructive",
        medium && "bg-[var(--risk-medium)]",
        !high && !medium && "bg-[var(--risk-low)]"
      )}
    />
  );
}

interface LeftPanelProps {
  caseId?: string | null;
  caseData?: unknown;
}

export function LeftPanel({ caseId }: LeftPanelProps) {
  const pathname = usePathname();
  const setLeftOpen = useUIStore((s) => s.setLeftPanelOpen);
  const [searchQ, setSearchQ] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => api.listCases(),
  });

  const cases = data?.cases ?? [];
  const highRiskCount = useMemo(
    () => cases.filter((c) => (c.risk_score ?? 0) > 50).length,
    [cases]
  );
  const completeCount = useMemo(
    () => cases.filter((c) => c.status === "complete").length,
    [cases]
  );

  const filtered = useMemo(() => {
    let list = cases;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.subject_name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }
    if (filter === "high_risk")
      list = list.filter((c) => (c.risk_score ?? 0) > 50);
    if (filter === "complete")
      list = list.filter((c) => c.status === "complete");
    return list;
  }, [cases, searchQ, filter]);

  return (
    <>
      <div className="flex h-full w-[264px] flex-col bg-card">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cases
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="default"
              size="xs"
              onClick={() => setModalOpen(true)}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              New
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setLeftOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Collapse panel"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-border px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter cases..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>

          {/* Filter tabs */}
          <div className="mt-2 flex gap-1">
            {(
              [
                { id: "all" as const, label: `All (${cases.length})` },
                { id: "high_risk" as const, label: `High risk (${highRiskCount})` },
                { id: "complete" as const, label: `Done (${completeCount})` },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                type="button"
                variant={filter === tab.id ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "flex-1 text-[11px]",
                  filter !== tab.id && "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Case list */}
        <ScrollArea className="flex-1">
          <div className="px-0 py-1">
            {isLoading && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {error && (
              <div className="px-3 py-6 text-center text-sm text-destructive">
                Failed to load cases
              </div>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {cases.length === 0
                  ? "No investigations yet"
                  : "No cases match filters"}
              </div>
            )}
            <ul className="py-1">
              {filtered.map((c: CaseSummary) => (
                <li key={c.id}>
                  <Link
                    href={`/cases/${c.id}`}
                    className={cn(
                      "flex items-start gap-2.5 border-l-2 px-3 py-2.5 text-sm transition-colors",
                      caseId === c.id
                        ? "border-primary bg-muted/50 text-foreground"
                        : "border-transparent hover:bg-muted/30"
                    )}
                  >
                    <RiskDot riskScore={c.risk_score} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{c.subject_name}</span>
                        <CaseStatusIndicator status={c.status} small />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(c.updated_at)}</span>
                        {c.risk_score != null && (
                          <span
                            className={cn(
                              "font-mono",
                              c.risk_score > 50 ? "text-destructive" : "text-muted-foreground"
                            )}
                          >
                            {c.risk_score}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-2">
          <Link
            href="/cases"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === "/cases"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            All investigations
          </Link>
        </div>
      </div>

      <NewInvestigationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
