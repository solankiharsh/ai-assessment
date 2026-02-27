"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { FolderSearch, Loader2, PanelLeftClose, Plus, Search } from "lucide-react";
import { CaseStatusIndicator } from "../CaseStatusIndicator";
import type { CaseSummary } from "@/lib/types";

type FilterTab = "all" | "high_risk" | "complete";

function RiskDot({ riskScore }: { riskScore?: number }) {
  const high = (riskScore ?? 0) > 50;
  const medium = (riskScore ?? 0) > 20 && (riskScore ?? 0) <= 50;
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        high && "bg-[var(--risk-critical)] shadow-[0_0_6px_var(--risk-critical)]",
        medium && "bg-[var(--risk-medium)]",
        !high && !medium && "bg-[var(--risk-low)]"
      )}
      aria-hidden
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
  const [newSubject, setNewSubject] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [newMaxIter, setNewMaxIter] = useState<number | "">("");
  const queryClient = useQueryClient();

  const startInvestigation = useMutation({
    mutationFn: (payload: {
      subject_name: string;
      current_role?: string;
      current_org?: string;
      max_iterations?: number;
    }) => api.investigate(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      window.location.href = `/cases/${res.case_id}`;
    },
  });

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
      list = list.filter((c) =>
        c.subject_name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
      );
    }
    if (filter === "high_risk") list = list.filter((c) => (c.risk_score ?? 0) > 50);
    if (filter === "complete") list = list.filter((c) => c.status === "complete");
    return list;
  }, [cases, searchQ, filter]);

  const onStartNew = () => {
    const name = newSubject.trim();
    if (!name) return;
    startInvestigation.mutate({
      subject_name: name,
      ...(newRole.trim() && { current_role: newRole.trim() }),
      ...(newOrg.trim() && { current_org: newOrg.trim() }),
      ...(typeof newMaxIter === "number" &&
        newMaxIter >= 1 &&
        newMaxIter <= 50 && { max_iterations: newMaxIter }),
    });
  };

  return (
    <div className="console-panel flex h-full w-[280px] flex-col bg-[var(--bg-secondary)]">
      <div className="shrink-0 border-b border-[var(--border)] p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            New investigation
          </span>
          <button
            type="button"
            onClick={() => setLeftOpen(false)}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
            aria-label="Collapse panel"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          placeholder="Subject name *"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStartNew()}
          className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm placeholder:text-[var(--muted)]"
        />
        <input
          type="text"
          placeholder="Role (optional)"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm placeholder:text-[var(--muted)]"
        />
        <input
          type="text"
          placeholder="Organization (optional)"
          value={newOrg}
          onChange={(e) => setNewOrg(e.target.value)}
          className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm placeholder:text-[var(--muted)]"
        />
        <input
          type="number"
          min={1}
          max={50}
          placeholder="Max iterations (optional)"
          value={newMaxIter === "" ? "" : newMaxIter}
          onChange={(e) => {
            const v = e.target.value;
            setNewMaxIter(v === "" ? "" : Math.min(50, Math.max(1, parseInt(v, 10) || 1)));
          }}
          className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm placeholder:text-[var(--muted)]"
        />
        <button
          type="button"
          onClick={onStartNew}
          disabled={!newSubject.trim() || startInvestigation.isPending}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded border py-1.5 text-xs font-medium",
            "border-amber-500/60 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
          )}
        >
          {startInvestigation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Run pipeline
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Investigations
        </span>
      </div>
      <div className="border-b border-[var(--border)] p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Search cases…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] py-2 pl-8 pr-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]"
          />
        </div>
        <div className="mt-2 flex gap-1">
          {(
            [
              { id: "all" as const, label: `ALL (${cases.length})` },
              { id: "high_risk" as const, label: `HIGH RISK (${highRiskCount})` },
              { id: "complete" as const, label: `COMPLETE (${completeCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex-1 rounded px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
                filter === tab.id
                  ? "bg-[var(--bg-card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--bg-hover)]",
                tab.id === "high_risk" && filter === tab.id && "bg-[var(--risk-critical)]/15 text-[var(--risk-high)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-4 text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading cases…</span>
          </div>
        )}
        {error && (
          <div className="px-3 py-4 text-sm text-[var(--risk-high)]">
            Failed to load cases. Retry from cases page.
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="px-3 py-4 text-sm text-[var(--muted)]">
            {cases.length === 0
              ? "No investigations yet. Create one from the cases page."
              : "No cases match filters."}
          </div>
        )}
        <ul className="py-1">
          {filtered.map((c: CaseSummary) => (
            <li key={c.id}>
              <Link
                href={`/cases/${c.id}`}
                className={cn(
                  "flex items-start gap-2 border-l-2 px-3 py-2 text-sm transition-colors",
                  caseId === c.id
                    ? "border-[var(--accent)] bg-[var(--bg-hover)] text-[var(--foreground)]"
                    : "border-transparent hover:bg-[var(--bg-card)]"
                )}
              >
                <RiskDot riskScore={c.risk_score} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.subject_name}</span>
                    <CaseStatusIndicator status={c.status} small />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{formatRelativeTime(c.updated_at)}</span>
                    {c.risk_score != null && (
                      <span className="text-[var(--risk-medium)]">
                        Risk {c.risk_score}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-[var(--border)] p-2">
        <Link
          href="/cases"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            pathname === "/cases"
              ? "bg-[var(--bg-card)] text-[var(--foreground)]"
              : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
          )}
        >
          <FolderSearch className="h-4 w-4" />
          Manage cases
        </Link>
      </div>
    </div>
  );
}
