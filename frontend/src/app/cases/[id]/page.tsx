"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PipelineProgress, currentNodeFromEvents } from "@/components/PipelineProgress";
import { ExecutionLog } from "@/components/ExecutionLog";
import { MetricsCards } from "@/components/MetricsCards";
import { TabOverview } from "@/components/tabs/TabOverview";
import { TabEntities } from "@/components/tabs/TabEntities";
import { TabGraph } from "@/components/tabs/TabGraph";
import { TabRisk } from "@/components/tabs/TabRisk";
import { TabTimeline } from "@/components/tabs/TabTimeline";
import { TabEvidence, type LiveProgressEvent } from "@/components/tabs/TabEvidence";
import { TabTrace } from "@/components/tabs/TabTrace";
import { TabReport } from "@/components/tabs/TabReport";

/* ────────────────────────────────────────────────────────────────── */
/*  Tab definitions (deriv-style: simple strings, no Zustand store)  */
/* ────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "report", label: "Report" },
  { id: "graph", label: "Graph" },
  { id: "risk", label: "Risk" },
  { id: "entities", label: "Entities" },
  { id: "timeline", label: "Timeline" },
  { id: "evidence", label: "Evidence" },
  { id: "log", label: "Log" },
] as const;

type TabId = typeof TABS[number]["id"];

/* ────────────────────────────────────────────────────────────────── */
/*  Progress helper — derive from SSE events                         */
/* ────────────────────────────────────────────────────────────────── */
function deriveProgress(events: LiveProgressEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (typeof e.progress === "number") return e.progress;
  }
  return 0;
}

function deriveLogs(events: LiveProgressEvent[]): string[] {
  return events
    .filter((e) => e.event === "log" && e.message)
    .map((e) => e.message as string);
}

/** Build captured execution log lines from search_history when no SSE logs (e.g. completed run). */
function deriveCapturedLogs(searchHistory: { phase?: string; iteration?: number; query?: string; provider?: string; timestamp?: string }[] | undefined): string[] {
  if (!searchHistory?.length) return [];
  const sorted = [...searchHistory].sort(
    (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime()
  );
  return sorted.map((r) => {
    const phase = r.phase ?? "search";
    const iter = r.iteration ?? 0;
    const q = (r.query ?? "").slice(0, 80);
    const provider = r.provider ?? "";
    return `[${phase}] Iteration ${iter} (${provider}): ${q}${(r.query ?? "").length > 80 ? "…" : ""}`;
  });
}

function deriveStats(inv: { entities?: unknown[]; risk_flags?: unknown[]; iteration?: number; estimated_cost_usd?: number } | undefined, events: LiveProgressEvent[]) {
  // Prefer live event counts while running, then fall back to inv data
  let entities = inv?.entities?.length ?? 0;
  let risks = inv?.risk_flags?.length ?? 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event === "complete") {
      entities = e.entities ?? entities;
      risks = e.risk_flags ?? risks;
      break;
    }
  }
  return {
    entities,
    risks,
    iteration: inv?.iteration ?? 0,
    costUsd: inv?.estimated_cost_usd ?? 0,
  };
}

/* ────────────────────────────────────────────────────────────────── */
/*  Page                                                              */
/* ────────────────────────────────────────────────────────────────── */
export default function CasePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [liveProgressEvents, setLiveProgressEvents] = useState<LiveProgressEvent[]>([]);

  const { data: inv, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["case", id],
    queryFn: () => api.getCase(id),
    enabled: !!id,
    refetchInterval: (query) => (query.state.status === "error" ? 3000 : false),
  });

  // Clear live events when investigation is complete
  useEffect(() => {
    if (inv?.status === "complete") {
      setLiveProgressEvents([]);
    }
  }, [inv?.status]);

  // SSE streaming for live progress
  useEffect(() => {
    if (!id || inv?.status !== "running") return;
    let cancelled = false;
    setLiveProgressEvents([]);
    const ac = new AbortController();

    fetch(`/api/investigate/${encodeURIComponent(id)}/stream`, { signal: ac.signal })
      .then((res) => {
        if (!res.body || cancelled) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        function processBlock(block: string) {
          const lines = block.split("\n");
          let eventType = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine) return;
          try {
            const data = JSON.parse(dataLine) as LiveProgressEvent & { event?: string };
            const resolvedEvent = eventType !== "message" ? eventType : (data.event ?? "message");
            const enriched: LiveProgressEvent = { ...data, event: resolvedEvent };
            if (resolvedEvent === "done") { refetch(); return; }
            setLiveProgressEvents((prev) => [...prev, enriched]);
          } catch { /* ignore malformed */ }
        }

        function read(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (cancelled || done) { if (done) refetch(); return; }
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";
            for (const block of blocks) { if (block.trim()) processBlock(block); }
            return read();
          });
        }
        return read();
      })
      .catch((err) => { if (err?.name !== "AbortError") refetch(); });

    return () => { cancelled = true; ac.abort(); };
  }, [id, inv?.status, refetch]);

  // Export report
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

  /* ── Derived state ─────────────────────────────────────────────── */
  const currentNode = currentNodeFromEvents(liveProgressEvents);
  const progress = deriveProgress(liveProgressEvents);
  const logs = deriveLogs(liveProgressEvents);
  const stats = deriveStats(inv, liveProgressEvents);
  const isRunning = inv?.status === "running";
  const isComplete = inv?.status === "complete";

  /* ── Error / loading states ─────────────────────────────────────── */
  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        Invalid case ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-neutral-400">
        <svg className="h-6 w-6 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">Loading investigation…</p>
      </div>
    );
  }

  if (error || !inv) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Case not found</p>
          <p className="mt-1 text-xs text-neutral-500">
            {isRefetching ? "Retrying…" : "This case may still be initializing"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5"
          >
            Retry
          </button>
          <a href="/cases" className="text-sm text-neutral-400 hover:text-white">
            All investigations
          </a>
        </div>
      </div>
    );
  }

  /* ── Normal render ──────────────────────────────────────────────── */
  const subjectLabel = [
    inv.subject?.current_role,
    inv.subject?.current_organization,
  ].filter(Boolean).join(" @ ") || "";

  return (
    <div className="min-h-screen">
      {/* Background gradient */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-orange-500/[0.03] blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <a href="/" className="hover:text-orange-400 transition-colors">Home</a>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <a href="/cases" className="hover:text-orange-400 transition-colors">Investigations</a>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-neutral-300">{inv.target}</span>
          </div>

          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-white sm:text-xl md:text-2xl">
                Investigating: {inv.target}
              </h1>
              {subjectLabel && (
                <p className="mt-0.5 text-xs text-neutral-400 sm:text-sm">{subjectLabel}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Status badge */}
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize sm:text-xs ${isRunning
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                  : isComplete
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                  }`}
              >
                {isRunning && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />}
                {inv.status}
              </span>

              {/* Export button */}
              {inv.final_report && (
                <button
                  onClick={exportReport}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/5"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Export
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── RUNNING STATE ───────────────────────────────────────── */}
        {isRunning && (
          <div className="mb-6 space-y-3 sm:mb-8 sm:space-y-4">
            {/* Pipeline progress */}
            <PipelineProgress currentNode={currentNode} />

            {/* Progress bar */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5 sm:h-2">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-700"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>

            {/* Metrics cards */}
            <MetricsCards
              entitiesCount={stats.entities}
              risksCount={stats.risks}
              iteration={stats.iteration}
              costUsd={stats.costUsd}
            />
          </div>
        )}

        {/* ── ERROR ───────────────────────────────────────────────── */}
        {inv.status === "failed" && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            Investigation failed. {inv.error_log?.[0] ?? ""}
          </div>
        )}

        {/* ── EXECUTION LOG (always visible while running) ────────── */}
        {isRunning && (
          <div className="mb-6 sm:mb-8">
            <ExecutionLog logs={logs} />
          </div>
        )}

        {/* ── COMPLETE STATE ──────────────────────────────────────── */}
        {isComplete && (
          <>
            {/* Metrics summary */}
            <div className="mb-6">
              <MetricsCards
                entitiesCount={inv.entities?.length ?? 0}
                risksCount={inv.risk_flags?.length ?? 0}
                iteration={inv.iteration ?? 0}
                costUsd={inv.estimated_cost_usd ?? 0}
              />
            </div>

            {/* Tabs */}
            <div>
              {/* Tab list */}
              <div className="mb-4 overflow-x-auto">
                <div className="flex w-full items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-1 min-w-max sm:gap-1">
                  {TABS.map((tab) => {
                    const display =
                      tab.id === "entities"
                        ? `Entities (${inv.entities?.length ?? 0})`
                        : tab.id === "risk"
                          ? `Risk (${inv.risk_flags?.length ?? 0})`
                          : tab.label;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap sm:text-sm ${activeTab === tab.id
                          ? "bg-orange-500/20 text-orange-400"
                          : "text-neutral-400 hover:text-white"
                          }`}
                      >
                        {display}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                {activeTab === "overview" && <TabOverview investigation={inv} onViewAllRisk={() => setActiveTab("risk")} />}
                {activeTab === "report" && <TabReport investigation={inv} />}
                {activeTab === "graph" && (
                  <div className="h-[680px] overflow-hidden rounded-lg border border-white/10 bg-black/20">
                    <TabGraph caseId={id} investigation={inv} />
                  </div>
                )}
                {activeTab === "risk" && <TabRisk investigation={inv} />}
                {activeTab === "entities" && <TabEntities investigation={inv} />}
                {activeTab === "timeline" && <TabTimeline investigation={inv} />}
                {activeTab === "evidence" && <TabEvidence investigation={inv} liveEvents={[]} />}
                {activeTab === "log" && (
                  <ExecutionLog
                    logs={(inv.logs?.length ? inv.logs : (inv.error_log?.length ? inv.error_log : deriveCapturedLogs(inv.search_history))) ?? []}
                    heightClass="h-96"
                    emptyMessage={!inv.logs?.length && !inv.error_log?.length && !deriveCapturedLogs(inv.search_history).length ? "No execution logs captured for this run. Live logs appear here during an active investigation." : undefined}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
