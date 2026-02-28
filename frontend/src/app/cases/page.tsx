"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { CaseSummary } from "@/lib/types";

type SortKey = "updated" | "risk" | "name";

function getRiskBadge(score?: number): { label: string; cls: string } {
  if (!score || score === 0) return { label: "Clear", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
  if (score > 50) return { label: "High", cls: "text-red-400 bg-red-500/10 border-red-500/20" };
  if (score > 20) return { label: "Medium", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
  return { label: "Low", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
}

function statusCls(status?: string) {
  if (status === "complete") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (status === "running") return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (status === "failed") return "text-red-400 bg-red-500/10 border-red-500/20";
  return "text-neutral-400 bg-white/5 border-white/10";
}

function CaseCard({ c }: { c: CaseSummary }) {
  const risk = getRiskBadge(c.risk_score);
  return (
    <Link href={`/cases/${c.id}`} className="group block">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-orange-500/20 hover:bg-orange-500/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-white group-hover:text-orange-300">
              {c.subject_name}
            </h3>
            <p className="mt-0.5 text-[10px] text-neutral-500">{formatRelativeTime(c.updated_at)}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusCls(c.status)}`}>
            {c.status ?? "unknown"}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {c.risk_score != null && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${risk.cls}`}>
              {risk.label} risk · {c.risk_score}
            </span>
          )}
          {c.confidence != null && (
            <span className="text-[10px] text-neutral-500">
              {Math.round(c.confidence * 100)}% confidence
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const [searchQ, setSearchQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("updated");

  const { data, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: () => api.listCases(),
    staleTime: 15_000,
  });

  const cases = data?.cases ?? [];

  const filtered = useMemo(() => {
    let list = cases;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter((c) =>
        c.subject_name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === "risk") return (b.risk_score ?? 0) - (a.risk_score ?? 0);
      if (sortBy === "name") return a.subject_name.localeCompare(b.subject_name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [cases, searchQ, sortBy]);

  return (
    <div className="min-h-screen">
      {/* Background gradient */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-orange-500/[0.03] blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <a href="/" className="text-xs text-neutral-400 hover:text-orange-400 sm:text-sm">
              ← Home
            </a>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Investigations
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              {cases.length} total · {cases.filter((c) => c.status === "running").length} running
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/solankiharsh/ai-assessment"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-400 transition-colors hover:bg-white/5 hover:text-white sm:text-sm"
              title="View source on GitHub"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
            >
              + New
            </button>
          </div>
        </div>

        {/* Search & sort */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="text"
              placeholder="Search investigations…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {(["updated", "risk", "name"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors capitalize ${sortBy === s
                    ? "bg-orange-500/20 text-orange-400"
                    : "text-neutral-400 hover:text-white"
                  }`}
              >
                {s === "updated" ? "Recent" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Cases grid */}
        {isLoading && (
          <div className="py-16 text-center text-sm text-neutral-500">
            Loading investigations…
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <svg className="h-6 w-6 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white">
                {cases.length === 0 ? "No investigations yet" : "No results match your search"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {cases.length === 0
                  ? "Start your first investigation from the home page"
                  : "Try a different search term"}
              </p>
            </div>
            {cases.length === 0 && (
              <button
                onClick={() => router.push("/")}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Start Investigation
              </button>
            )}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
