"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { CaseSummary } from "@/lib/types";

/* ── Pipeline steps (our actual nodes) ──────────────────────────────── */
const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Director",
    description:
      "Orchestrates the investigation: chooses the next step (search, risk analysis, connection mapping, source verification, or generate report) and research phase based on coverage and diminishing returns.",
    tech: "LangGraph",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "02",
    title: "Web Research",
    description:
      "Runs phased search queries (Baseline → Breadth → Depth → Adversarial → Triangulation) via Tavily (and Brave fallback) with result deduplication.",
    tech: "Tavily + Brave",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "03",
    title: "Fact Extraction",
    description:
      "Extracts entities, connections, and facts with confidence scores and source URLs from retrieved content; batches by token budget.",
    tech: "Multi-LLM",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "04",
    title: "Risk Analysis",
    description:
      "Risk Analyst and Devil's Advocate LLMs debate to surface regulatory, reputational, financial, and legal flags with severity and mitigation.",
    tech: "LLM Debate",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "05",
    title: "Connection Mapping",
    description:
      "Maps relationships between entities (e.g. WORKS_AT, BOARD_MEMBER_OF) with confidence; feeds the identity graph and Neo4j schema.",
    tech: "LLM",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "06",
    title: "Source Verification",
    description:
      "Cross-checks claims across sources and flags contradictions; improves confidence and supports risk and temporal analysis.",
    tech: "LLM",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "07",
    title: "Entity Resolution",
    description:
      "When the Director chooses report: deduplicates and merges entities via fuzzy matching and alias resolution for a clean graph.",
    tech: "Graph + NLP",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "08",
    title: "Temporal Analysis",
    description:
      "Builds chronological temporal facts and detects contradictions (e.g. overlapping roles); feeds the Timeline tab and report.",
    tech: "LLM",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "09",
    title: "Report Generation",
    description:
      "Synthesizes the due diligence report from entities, connections, risks, temporal facts, and graph insights; supports PII redaction.",
    tech: "Multi-LLM",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "10",
    title: "Neo4j Graph DB",
    description:
      "Persists entities, connections, and risk flags to Neo4j; runs graph discovery (degree centrality, shortest path subject→risk entities, shell-company detection) and appends insights to the report and Graph tab.",
    tech: "Neo4j + React Flow",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m-16.5 0v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const FEATURES = [
  {
    title: "Multi-Phase Search Loop",
    description:
      "Six distinct search phases — Baseline, Breadth, Depth, Adversarial, Triangulation, Synthesis — that loop adaptively until coverage is sufficient.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Multi-Model AI Debate",
    description:
      "Risk Analyst and Devil's Advocate LLMs debate each risk finding, ensuring balanced assessments with mitigation factors.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Entity Resolution",
    description:
      "Fuzzy-matching deduplication merges entities across aliases and co-references, building a clean entity graph.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Temporal Intelligence",
    description:
      "Reconstructs chronological timelines, detects date inconsistencies, and surfaces career and association history.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Identity Graph",
    description:
      "Neo4j persistence with Cypher graph queries and interactive React Flow visualization for entities and relationships.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Real-time SSE Streaming",
    description:
      "Watch the investigation unfold live — facts, entities, and risks appear as the agent discovers them via Server-Sent Events.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
        <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const TECH_STACK = [
  { name: "LangGraph", role: "Agent orchestration" },
  { name: "OpenAI", role: "Deep analysis" },
  { name: "Anthropic", role: "Risk debate" },
  { name: "Google Gemini", role: "Report synthesis" },
  { name: "Tavily", role: "Web search API" },
  { name: "FastAPI", role: "SSE streaming backend" },
  { name: "Next.js", role: "React frontend" },
  { name: "React Flow", role: "Identity graph" },
];

const STATS = [
  { value: "6", label: "Search phases" },
  { value: "10", label: "Pipeline stages" },
  { value: "3+", label: "AI models" },
  { value: "100%", label: "Real-time streaming" },
];

/* ── Animated Demo Section ──────────────────────────────────────── */
const DEMO_LOGS = [
  "[Director] Analyzing subject: Timothy Overturf, CEO @ Sisu Capital",
  "[WebResearch] Phase: BASELINE — running 4 search queries",
  "[WebResearch] Retrieved 23 results from Tavily API",
  "[FactExtraction] Extracted 12 facts from source documents",
  "[FactExtraction] SEC complaint (LR-25807) filed Aug 1 2023 against Sisu Capital",
  "[RiskAnalysis] Risk Analyst: CRITICAL — SEC fraud allegation detected",
  "[RiskAnalysis] Devil's Advocate: corroborated by FINRA CRD records",
  "[EntityResolution] Resolved 3 aliases → Timothy Overturf (target)",
  "[WebResearch] Phase: DEPTH — running 6 targeted queries",
  "[FactExtraction] Extracted 31 new facts — total: 43",
  "[TemporalAnalysis] Timeline reconstructed: 1997–2023 career history",
  "[TemporalAnalysis] Contradiction detected: founding date inconsistency",
  "[AdaptiveRefinement] Coverage sufficient — proceeding to synthesis",
  "[ReportGeneration] Synthesizing due diligence report…",
  "[Neo4j] 108 entities, 104 connections persisted; graph discovery (centrality, paths) run",
  "[Director] Investigation complete — 2 iterations, 5 risk flags",
];

const DEMO_NODES = [
  "Director", "Web Research", "Fact Extraction", "Risk Analysis",
  "Connection Mapping", "Source Verification", "Entity Resolution",
  "Temporal Analysis", "Report Gen", "Neo4j Graph",
];

function DemoSection() {
  const [logIdx, setLogIdx] = useState(0);
  const [nodeIdx, setNodeIdx] = useState(0);
  const [metrics, setMetrics] = useState({ entities: 0, risks: 0, iterations: 0, facts: 0 });
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogIdx((i) => {
        const next = (i + 1) % DEMO_LOGS.length;
        // Advance node every ~3 logs
        setNodeIdx((n) => Math.min(next, DEMO_NODES.length - 1));
        // Update metrics
        setMetrics({
          entities: Math.min(108, Math.round((next / DEMO_LOGS.length) * 108)),
          risks: Math.min(5, Math.round((next / DEMO_LOGS.length) * 5)),
          iterations: Math.min(2, Math.round((next / DEMO_LOGS.length) * 2)),
          facts: Math.min(43, Math.round((next / DEMO_LOGS.length) * 43)),
        });
        return next;
      });
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logIdx]);

  const visibleLogs = DEMO_LOGS.slice(0, logIdx + 1);

  return (
    <section className="border-t border-white/5 py-12 sm:py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-medium text-orange-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
            Live Demo
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Watch the Agent Work
          </h2>
          <p className="mt-2 text-sm text-neutral-400 sm:mt-3">
            A simulated investigation of <span className="text-orange-400 font-medium">Timothy Overturf, CEO @ Sisu Capital</span>
          </p>
          <p className="mt-1 text-xs text-neutral-500 max-w-xl mx-auto">
            Director-driven loop (search → facts → risk → connections → verification) then synthesis: entity resolution, temporal analysis, report generation, and Neo4j persistence with graph discovery.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {/* Pipeline nodes strip */}
          <div className="border-b border-white/5 p-4 sm:p-5">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {DEMO_NODES.map((node, i) => {
                const done = i < nodeIdx;
                const active = i === nodeIdx;
                return (
                  <div key={node} className="flex items-center shrink-0">
                    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all duration-500 ${done ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : active ? "bg-orange-500/15 text-orange-400 border border-orange-500/30 ring-1 ring-orange-500/20"
                          : "bg-white/[0.02] text-neutral-600 border border-white/5"
                      }`}>
                      {done ? (
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : active ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                      ) : (
                        <span className="text-neutral-700 font-mono text-[9px]">{String(i + 1).padStart(2, "0")}</span>
                      )}
                      {node}
                    </div>
                    {i < DEMO_NODES.length - 1 && (
                      <div className={`mx-1 h-px w-4 shrink-0 transition-colors duration-500 ${done ? "bg-emerald-500/40" : "bg-white/10"
                        }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metrics + Log */}
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {/* Metrics */}
            <div className="border-b border-white/5 p-4 sm:border-b-0 sm:border-r sm:p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Live Metrics</p>
              <div className="space-y-3">
                {[
                  { label: "Entities", value: metrics.entities, color: "text-orange-400" },
                  { label: "Risk Flags", value: metrics.risks, color: "text-red-400" },
                  { label: "Facts Extracted", value: metrics.facts, color: "text-emerald-400" },
                  { label: "Iterations", value: metrics.iterations, color: "text-blue-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">{label}</span>
                    <span className={`font-mono text-sm font-bold tabular-nums transition-all duration-300 ${color}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution Log */}
            <div className="col-span-2 p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Execution Log</p>
                <span className="font-mono text-[10px] text-neutral-600">{logIdx + 1}/{DEMO_LOGS.length} entries</span>
              </div>
              <div
                ref={logRef}
                className="h-40 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed"
              >
                {visibleLogs.map((line, i) => {
                  const isErr = line.includes("CRITICAL") || line.includes("ERROR");
                  const isWarn = line.includes("Contradiction") || line.includes("inconsistency");
                  const isDone = line.includes("complete") || line.includes("Complete");
                  const color = isErr ? "text-red-400" : isWarn ? "text-amber-400" : isDone ? "text-emerald-400" : "text-neutral-400";
                  return (
                    <div key={i} className={`flex gap-2 ${color} ${i === visibleLogs.length - 1 ? "animate-pulse" : ""}`}>
                      <span className="shrink-0 text-neutral-700 select-none">&gt;</span>
                      <span>{line}</span>
                    </div>
                  );
                })}
                <div className="mt-1 flex gap-2 text-neutral-600">
                  <span className="shrink-0">▌</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Status badge helpers ─────────────────────────────────────────── */
function statusColor(status: string | undefined) {
  if (status === "complete") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (status === "running") return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (status === "error") return "text-red-400 bg-red-500/10 border-red-500/20";
  return "text-neutral-400 bg-white/5 border-white/10";
}

function RecentCaseRow({ c }: { c: CaseSummary }) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`/cases/${c.id}`)}
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:border-orange-500/20 hover:bg-orange-500/[0.03]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{c.subject_name}</p>
        <p className="text-[10px] text-neutral-500">{formatRelativeTime(c.updated_at)}</p>
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusColor(c.status)}`}>
        {c.status}
      </span>
      {c.risk_score != null && (
        <span className="font-mono text-xs text-neutral-400">
          risk {c.risk_score}
        </span>
      )}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function HomePage() {
  const router = useRouter();
  const [targetName, setTargetName] = useState("");
  const [targetContext, setTargetContext] = useState("");
  const [targetOrg, setTargetOrg] = useState("");
  const [maxIterations, setMaxIterations] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: casesData } = useQuery({
    queryKey: ["cases"],
    queryFn: () => api.listCases(),
    staleTime: 30_000,
  });

  const recentCases = (casesData?.cases ?? [])
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const handleStart = async () => {
    if (!targetName.trim()) return;
    setSubmitting(true);
    setFormError("");
    try {
      const res = await api.investigate({
        subject_name: targetName.trim(),
        current_role: targetContext.trim() || undefined,
        current_org: targetOrg.trim() || undefined,
        max_iterations: maxIterations,
      });
      router.push(`/cases/${res.case_id}`);
    } catch (err) {
      setFormError((err as Error).message ?? "Failed to start investigation");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-orange-500/[0.04] blur-[100px]" />
          <div className="absolute right-0 top-1/3 h-[300px] w-[400px] rounded-full bg-orange-600/[0.03] blur-[80px]" />
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-20 lg:flex-row lg:items-start lg:gap-16 lg:pt-28">
          {/* Left — headline */}
          <div className="flex-1 text-center lg:text-left">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-medium text-orange-400 sm:px-4 sm:py-1.5 sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                Autonomous AI Research Agent
              </span>
              <a
                href="https://github.com/solankiharsh/ai-assessment"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:border-white/20 hover:text-white sm:px-4 sm:py-1.5 sm:text-xs"
                title="View source on GitHub"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </a>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
              AI-Powered
              <br />
              <span className="text-orange-500">Due Diligence</span>
              <br />
              Research Agent
            </h1>

            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-neutral-400 sm:mt-6 sm:text-lg lg:mx-0">
              Enter a name, and our autonomous agent investigates across the web
              — extracting facts, mapping relationships, flagging risks, and
              generating a comprehensive report. All in real-time.
            </p>

            {/* Stats row */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:max-w-lg">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-center">
                  <p className="text-xl font-bold text-orange-500 sm:text-2xl">{s.value}</p>
                  <p className="mt-0.5 text-[10px] text-neutral-500 sm:text-[11px]">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 justify-center lg:justify-start">
              {TECH_STACK.slice(0, 5).map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-neutral-400 sm:px-3 sm:text-xs"
                >
                  <span className="h-1 w-1 rounded-full bg-orange-500/60 sm:h-1.5 sm:w-1.5" />
                  {t.name}
                </div>
              ))}
            </div>
          </div>

          {/* Right — CTA form */}
          <div className="w-full max-w-md shrink-0">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
              <h2 className="mb-1 text-base font-semibold text-white sm:text-lg">
                Start Investigation
              </h2>
              <p className="mb-4 text-xs text-neutral-500 sm:mb-5 sm:text-sm">
                Enter a target to investigate.
              </p>

              <div className="space-y-3.5 sm:space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-400 sm:text-xs">
                    Target Name <span className="text-orange-500">*</span>
                  </label>
                  <input
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                    placeholder="e.g. John Smith"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 h-10 sm:h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-400 sm:text-xs">
                    Role / Title
                  </label>
                  <input
                    value={targetContext}
                    onChange={(e) => setTargetContext(e.target.value)}
                    placeholder="e.g. CEO, Founder"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 h-10 sm:h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-400 sm:text-xs">
                    Organization
                  </label>
                  <input
                    value={targetOrg}
                    onChange={(e) => setTargetOrg(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 h-10 sm:h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-neutral-400 sm:text-xs">
                      Max Search Iterations
                    </label>
                    <span className="font-mono text-xs text-orange-400 sm:text-sm">
                      {maxIterations}
                    </span>
                  </div>
                  <input
                    type="range"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(Number(e.target.value))}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full py-2"
                  />
                </div>

                {formError && (
                  <p className="text-xs text-red-400">{formError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleStart}
                    disabled={!targetName.trim() || submitting}
                    className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed h-10 sm:h-11"
                  >
                    {submitting ? "Starting…" : "Investigate"}
                  </button>
                  <button
                    onClick={() => router.push("/cases")}
                    className="rounded-lg border border-orange-500/30 px-4 py-2 text-sm font-semibold text-orange-400 transition-colors hover:bg-orange-500/10 hover:text-orange-300 h-10 sm:h-11"
                  >
                    View All
                  </button>
                </div>
              </div>
            </div>

            {/* Recent investigations */}
            {recentCases.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium text-neutral-500 sm:text-xs">
                  Recent Investigations
                </p>
                <div className="space-y-1.5">
                  {recentCases.map((c) => (
                    <RecentCaseRow key={c.id} c={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      {/* ── DEMO SECTION ──────────────────────────────────── */}
      <DemoSection />

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-neutral-950/50 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Built for Serious Research
            </h2>
            <p className="mt-2 text-sm text-neutral-400 sm:mt-3 sm:text-base">
              Everything you need for autonomous due diligence investigation.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-orange-500/20 hover:bg-orange-500/[0.03] sm:p-5 md:p-6"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 transition-colors group-hover:bg-orange-500/20 sm:mb-4 sm:h-10 sm:w-10">
                  {feature.icon}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold text-white sm:mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs leading-relaxed text-neutral-500 sm:text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="border-t border-white/5 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              How It Works
            </h2>
            <p className="mt-2 text-sm text-neutral-400 sm:mt-3 sm:text-base max-w-2xl mx-auto">
              A 10-stage autonomous pipeline powered by LangGraph. The Director loops through
              stages 2–6 (Web Research, Fact Extraction, Risk Analysis, Connection Mapping, Source Verification)
              until coverage is sufficient; then stages 7–10 (Entity Resolution, Temporal Analysis, Report Generation,
              Neo4j Graph DB) run once. Neo4j persists the identity graph and runs discovery (centrality, paths, shell-company detection) to enrich the report and Graph tab.
            </p>
          </div>

          <div className="mt-8 space-y-0 sm:mt-12 lg:mt-14">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.step} className="relative flex gap-4 sm:gap-6">
                {/* Vertical connector line */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="absolute left-[18px] top-12 bottom-0 w-px bg-gradient-to-b from-orange-500/30 to-white/5 sm:left-5 sm:top-14" />
                )}

                {/* Step number circle */}
                <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 sm:h-10 sm:w-10">
                  {step.icon}
                </div>

                {/* Content */}
                <div className="pb-8 sm:pb-10">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="font-mono text-[10px] text-orange-500/60 sm:text-xs">
                      STEP {step.step}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-medium text-neutral-500 sm:text-[10px]">
                      {step.tech}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-white sm:text-lg">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500 sm:mt-1.5 sm:text-sm">
                    {step.description}
                  </p>

                  {/* Loop indicator after step 6 */}
                  {step.step === "06" && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-orange-500/15 bg-orange-500/5 px-2.5 py-1.5 text-[10px] text-orange-400/80 sm:mt-3 sm:px-3 sm:py-2 sm:text-xs">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
                        <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Stages 2–6 loop back to Director until coverage is sufficient; then 7–10 run once
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ───────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-neutral-950/50 py-10 sm:py-14 md:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-xl font-bold text-white sm:text-2xl">
            Tech Stack
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-4 sm:gap-4 md:mt-10">
            {TECH_STACK.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center sm:p-4"
              >
                <p className="text-xs font-semibold text-white sm:text-sm">{t.name}</p>
                <p className="mt-0.5 text-[10px] text-neutral-500 sm:mt-1 sm:text-xs">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-6 sm:py-8">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <p className="text-[10px] text-neutral-600 sm:text-xs">
            AI Due Diligence Research Agent · Autonomous intelligence platform
          </p>
        </div>
      </footer>
    </div>
  );
}
