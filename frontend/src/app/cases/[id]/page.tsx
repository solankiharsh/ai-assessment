"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUIStore, TABS } from "@/store/useUIStore";
import { CommandPalette } from "@/components/CommandPalette";
import { InvestigationProgressBar } from "@/components/InvestigationProgressBar";
import { TabOverview } from "@/components/tabs/TabOverview";
import { TabEntities } from "@/components/tabs/TabEntities";
import { TabGraph } from "@/components/tabs/TabGraph";
import { TabRisk } from "@/components/tabs/TabRisk";
import { TabSources } from "@/components/tabs/TabSources";
import { TabTrace, type LiveProgressEvent } from "@/components/tabs/TabTrace";
import { SearchTimeline } from "@/components/SearchTimeline";
import { Maximize2, Download, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CasePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const tabFromUrl = searchParams.get("tab") as typeof TABS[number]["id"] | null;
  const entityFromUrl = searchParams.get("entity");

  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setSelectedEntityId = useUIStore((s) => s.setSelectedEntityId);
  const setFocusMode = useUIStore((s) => s.setFocusMode);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [liveProgressEvents, setLiveProgressEvents] = useState<LiveProgressEvent[]>([]);

  const { data: inv, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["case", id],
    queryFn: () => api.getCase(id),
    enabled: !!id,
    refetchInterval: (query) => (query.state.status === "error" ? 3000 : false),
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

  // When status is running, open SSE stream for live progress and append to liveProgressEvents; on done, refetch.
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
                const data = JSON.parse(m) as LiveProgressEvent & { event?: string };
                if (data.event === "done") {
                  refetch();
                  return;
                }
                setLiveProgressEvents((prev) => [...prev, data]);
              } catch {
                // ignore parse errors
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
      <div className="flex h-full items-center justify-center text-zinc-500">
        Invalid case ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Loading investigation…</p>
      </div>
    );
  }

  if (error || !inv) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <p className="text-amber-500">Case not found or pipeline still running.</p>
        <p className="text-sm text-zinc-500">
          {isRefetching ? "Checking again…" : "Refreshing automatically every few seconds."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded border border-amber-500/50 px-4 py-2 text-sm hover:bg-amber-500/10"
        >
          Retry now
        </button>
        <Link href="/cases" className="text-sm text-zinc-400 hover:underline">
          Back to cases
        </Link>
      </div>
    );
  }

  const tabContent = {
    overview: <TabOverview investigation={inv} />,
    entities: <TabEntities investigation={inv} />,
    graph: <TabGraph caseId={id} investigation={inv} />,
    risk: <TabRisk investigation={inv} />,
    sources: <TabSources investigation={inv} />,
    trace: <TabTrace investigation={inv} liveEvents={liveProgressEvents} />,
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
          <div className="flex items-center gap-3">
            <Link
              href="/cases"
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              Cases
            </Link>
            <span className="text-zinc-600">/</span>
            <h1 className="text-sm font-semibold text-zinc-100">
              {inv.target}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="rounded border border-[var(--border)] px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              <span className="font-mono">⌘K</span> Jump to entity
            </button>
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              className="rounded border border-[var(--border)] p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Focus mode"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={exportReport}
              disabled={!inv.final_report}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export report
            </button>
          </div>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-1">
          <InvestigationProgressBar
            iteration={inv.iteration}
            maxIterations={inv.max_iterations}
            phase={inv.current_phase}
            status={inv.status}
          />
          <nav className="flex gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeTab === t.id
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {activeTab !== "graph" && (inv.entities?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("graph")}
              className="ml-auto rounded border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/20"
            >
              View connection graph →
            </button>
          )}
        </div>

        <main className="min-h-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {tabContent[activeTab]}
            </motion.div>
          </AnimatePresence>
        </main>
        <SearchTimeline
          searchHistory={inv.search_history ?? []}
          maxBars={20}
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