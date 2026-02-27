"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CaseStatusIndicator } from "@/components/CaseStatusIndicator";
import { NewInvestigationModal } from "@/components/NewInvestigationModal";
import {
  Plus,
  Search,
  Shield,
  Users,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { CaseSummary } from "@/lib/types";

type SortKey = "updated" | "risk" | "name";

function getRiskTier(score?: number): { label: string; color: string } {
  if (!score || score === 0) return { label: "Clear", color: "var(--risk-low)" };
  if (score > 50) return { label: "High", color: "var(--risk-high)" };
  if (score > 20) return { label: "Medium", color: "var(--risk-medium)" };
  return { label: "Low", color: "var(--risk-low)" };
}

function CaseCard({ case_ }: { case_: CaseSummary }) {
  const risk = getRiskTier(case_.risk_score);

  return (
    <Link
      href={`/cases/${case_.id}`}
      className="group flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--foreground)] group-hover:text-white">
            {case_.subject_name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {formatRelativeTime(case_.updated_at)}
          </p>
        </div>
        <CaseStatusIndicator status={case_.status} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        {case_.risk_score != null && (
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: risk.color }}
            />
            <span className="font-mono text-xs" style={{ color: risk.color }}>
              {case_.risk_score}
            </span>
            <span className="text-xs text-[var(--muted)]">{risk.label}</span>
          </div>
        )}
        {case_.confidence != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--muted)]">Confidence</span>
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {Math.round(case_.confidence * 100)}%
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <Icon className="h-5 w-5" style={{ color: accent ?? "var(--muted)" }} />
      <div>
        <div className="font-mono text-lg font-semibold text-[var(--foreground)]">
          {value}
        </div>
        <div className="text-xs text-[var(--muted)]">{label}</div>
      </div>
    </div>
  );
}

export default function CasesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("updated");

  const { data, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: () => api.listCases(),
  });

  const cases = data?.cases ?? [];
  const totalCases = cases.length;
  const highRiskCount = useMemo(
    () => cases.filter((c) => (c.risk_score ?? 0) > 50).length,
    [cases]
  );
  const completedCount = useMemo(
    () => cases.filter((c) => c.status === "complete").length,
    [cases]
  );

  const filtered = useMemo(() => {
    let list = cases;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(
        (c) =>
          c.subject_name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "risk")
        return (b.risk_score ?? 0) - (a.risk_score ?? 0);
      if (sortBy === "name")
        return a.subject_name.localeCompare(b.subject_name);
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
    return list;
  }, [cases, searchQ, sortBy]);

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">
              Investigations
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Background research and due diligence cases
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]/90"
          >
            <Plus className="h-4 w-4" />
            New investigation
          </button>
        </div>

        {/* Stats row */}
        {totalCases > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Users} value={totalCases} label="Total cases" />
            <StatCard
              icon={AlertTriangle}
              value={highRiskCount}
              label="High risk"
              accent="var(--risk-high)"
            />
            <StatCard
              icon={CheckCircle2}
              value={completedCount}
              label="Completed"
              accent="var(--risk-low)"
            />
            <StatCard
              icon={Shield}
              value={totalCases - completedCount}
              label="In progress"
              accent="var(--accent)"
            />
          </div>
        )}

        {/* Search & sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Search investigations..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-9 pr-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-1">
            {(
              [
                { id: "updated" as const, label: "Recent" },
                { id: "risk" as const, label: "Risk" },
                { id: "name" as const, label: "Name" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortBy(s.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sortBy === s.id
                    ? "bg-[var(--bg-hover)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--text-secondary)]"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Case grid */}
        {isLoading && (
          <div className="py-12 text-center text-sm text-[var(--muted)]">
            Loading investigations...
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Shield className="h-12 w-12 text-[var(--border-strong)]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {cases.length === 0
                  ? "No investigations yet"
                  : "No results match your search"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {cases.length === 0
                  ? "Start your first investigation to see results here"
                  : "Try a different search term"}
              </p>
            </div>
            {cases.length === 0 && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                New investigation
              </button>
            )}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <CaseCard key={c.id} case_={c} />
            ))}
          </div>
        )}
      </div>

      <NewInvestigationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
