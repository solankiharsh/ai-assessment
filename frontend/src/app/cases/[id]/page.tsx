"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUIStore, TABS } from "@/store/useUIStore";
import { CommandPalette } from "@/components/CommandPalette";
import { PhaseStepper } from "@/components/PhaseStepper";
import { TabOverview } from "@/components/tabs/TabOverview";
import { TabEntities } from "@/components/tabs/TabEntities";
import { TabGraph } from "@/components/tabs/TabGraph";
import { TabRisk } from "@/components/tabs/TabRisk";
import { TabTimeline } from "@/components/tabs/TabTimeline";
import { TabEvidence, type LiveProgressEvent } from "@/components/tabs/TabEvidence";
import { InvestigationLogs } from "@/components/InvestigationLogs";
import {
  Maximize2,
  Download,
  Loader2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { cn, formatDurationSeconds } from "@/lib/utils";

export default function CasePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const tabFromUrl = searchParams.get("tab") as
    | (typeof TABS)[number]["id"]
    | null;
  const entityFromUrl = searchParams.get("entity");

  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setSelectedEntityId = useUIStore((s) => s.setSelectedEntityId);
  const setFocusMode = useUIStore((s) => s.setFocusMode);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [liveProgressEvents, setLiveProgressEvents] = useState<
    LiveProgressEvent[]
  >([]);

  const {
    data: inv,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["case", id],
    queryFn: () => api.getCase(id),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.status === "error" ? 3000 : false,
  });

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, setActiveTab]);

  useEffect(() => {
    if (entityFromUrl) setSelectedEntityId(entityFromUrl);
  }, [entityFromUrl, setSelectedEntityId]);

  useEffect(() => {
    if (inv?.status === "complete") setLiveProgressEvents([]);
  }, [inv?.status]);

  // SSE streaming for live progress
  useEffect(() => {
    if (!id || inv?.status !== "running") return;
    let cancelled = false;
    setLiveProgressEvents([]);
    const ac = new AbortController();
    fetch(`/api/investigate/${encodeURIComponent(id)}/stream`, {
      signal: ac.signal,
    })
      .then((res) => {
        if (!res.body || cancelled) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        function read(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (cancelled || done) {
              if (done) refetch();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const m = line.startsWith("data: ") ? line.slice(6) : null;
              if (!m) continue;
              try {
                const data = JSON.parse(m) as LiveProgressEvent & {
                  event?: string;
                };
                if (data.event === "done") {
                  refetch();
                  return;
                }
                setLiveProgressEvents((prev) => [...prev, data]);
              } catch {
                // ignore
              }
            }
            return read();
          });
        }
        return read();
      })
      .catch((err) => {
        if (err?.name !== "AbortError") refetch();
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [id, inv?.status, refetch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFocusMode]);

  const exportReport = useCallback(() => {
    if (!inv?.final_report) return;
    const blob = new Blob([inv.final_report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [id, inv?.final_report]);

  if (!id) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        Invalid case ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--muted)]">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading investigation...</p>
      </div>
    );
  }

  if (error || !inv) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-8 w-8 text-[var(--risk-medium)]" />
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">
            Case not found or still running
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isRefetching
              ? "Checking again..."
              : "Refreshing automatically"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
          >
            Retry
          </button>
          <Link
            href="/cases"
            className="text-sm text-[var(--muted)] hover:text-[var(--text-secondary)]"
          >
            Back to cases
          </Link>
        </div>
      </div>
    );
  }

  const tabContent = {
    brief: <TabOverview investigation={inv} />,
    timeline: <TabTimeline investigation={inv} />,
    risk: <TabRisk investigation={inv} />,
    network: <TabGraph caseId={id} investigation={inv} />,
    entities: <TabEntities investigation={inv} />,
    evidence: (
      <TabEvidence investigation={inv} liveEvents={liveProgressEvents} />
    ),
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Top bar: breadcrumb + actions */}
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-sm">
            <Link
              href="/cases"
              className="text-[var(--muted)] hover:text-[var(--text-secondary)]"
            >
              Investigations
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--border-strong)]" />
            <span className="font-medium text-[var(--foreground)]">
              {inv.target}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
              title="Focus mode (Esc to exit)"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={exportReport}
              disabled={!inv.final_report}
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </header>

        {/* Phase stepper + stat counters */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
          <PhaseStepper
            currentPhase={inv.current_phase}
            status={inv.status}
          />
          <div className="hidden items-center gap-4 text-xs md:flex">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--muted)]">Entities</span>
              <span className="font-mono font-medium text-[var(--foreground)]">
                {inv.entities?.length ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--muted)]">Connections</span>
              <span className="font-mono font-medium text-[var(--foreground)]">
                {inv.connections?.length ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--muted)]">Risk</span>
              {inv.report_risk_level && (inv.risk_flags?.length ?? 0) === 0 ? (
                <span
                  className={cn(
                    "font-mono text-[10px] font-semibold uppercase rounded px-1.5 py-0.5",
                    inv.report_risk_level === "critical" && "bg-[var(--risk-critical)]/20 text-[var(--risk-critical)]",
                    inv.report_risk_level === "high" && "bg-[var(--risk-high)]/20 text-[var(--risk-high)]",
                    inv.report_risk_level === "medium" && "bg-[var(--risk-medium)]/20 text-[var(--risk-medium)]",
                    inv.report_risk_level === "low" && "bg-[var(--risk-low)]/20 text-[var(--risk-low)]",
                    (!inv.report_risk_level || inv.report_risk_level === "clear") && "text-[var(--foreground)]"
                  )}
                >
                  {inv.report_risk_level}
                </span>
              ) : (
                <span
                  className={cn(
                    "font-mono font-medium",
                    (inv.risk_flags?.length ?? 0) > 0
                      ? "text-[var(--risk-high)]"
                      : "text-[var(--foreground)]"
                  )}
                >
                  {inv.risk_flags?.length ?? 0}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--muted)]">Confidence</span>
              <span className="font-mono font-medium text-[var(--foreground)]">
                {Math.round(inv.overall_confidence * 100)}%
              </span>
            </div>
            {inv.run_metadata?.duration_seconds != null && inv.run_metadata.duration_seconds > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--muted)]">Duration</span>
                <span className="font-mono font-medium text-[var(--foreground)]">
                  {formatDurationSeconds(inv.run_metadata.duration_seconds)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-4 py-1">
          <nav className="flex gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === t.id
                    ? "bg-[var(--bg-card)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--text-secondary)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <main className="min-h-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {tabContent[activeTab]}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Investigation logs (phase-by-phase progress) */}
        <InvestigationLogs
          searchHistory={inv.search_history ?? []}
          subjectName={inv.target}
          maxEntries={40}
        />
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        entities={inv.entities}
        caseId={id}
      />
    </>
  );
}
