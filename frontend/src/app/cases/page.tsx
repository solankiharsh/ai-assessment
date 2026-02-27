"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { subjectToSlug } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { CaseStatusIndicator } from "@/components/CaseStatusIndicator";
import { Plus, Loader2, Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SortKey = "updated" | "risk";

export default function CasesPage() {
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [maxIterations, setMaxIterations] = useState<number | "">("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cases"],
    queryFn: () => api.listCases(),
  });

  const mutate = useMutation({
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

  const cases = data?.cases ?? [];
  const filtered = search.trim()
    ? cases.filter((c) =>
        c.subject_name.toLowerCase().includes(search.toLowerCase())
      )
    : cases;
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "risk") {
      const ra = a.risk_score ?? 0;
      const rb = b.risk_score ?? 0;
      return rb - ra;
    }
    return (
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  });

  const handleCreate = () => {
    const name = subject.trim();
    if (!name) return;
    mutate.mutate({
      subject_name: name,
      ...(role.trim() && { current_role: role.trim() }),
      ...(org.trim() && { current_org: org.trim() }),
      ...(typeof maxIterations === "number" &&
        maxIterations >= 1 &&
        maxIterations <= 50 && { max_iterations: maxIterations }),
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Case management
        </h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search cases…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded border border-[var(--border)] bg-zinc-900 py-1.5 pl-8 pr-2 text-sm placeholder:text-zinc-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort(sort === "updated" ? "risk" : "updated")}
            className="flex items-center gap-1 rounded border border-[var(--border)] bg-zinc-900 px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sort === "updated" ? "Last updated" : "Risk"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden p-4">
        <section className="flex flex-1 flex-col overflow-hidden rounded border border-[var(--border)] bg-zinc-900/50">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Investigations
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-amber-500">
                <p>Failed to load cases.</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="rounded border border-amber-500/50 px-3 py-1.5 text-sm hover:bg-amber-500/10"
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !error && sorted.length === 0 && (
              <div className="py-12 text-center text-sm text-zinc-500">
                {search.trim()
                  ? "No cases match your search."
                  : "No investigations yet. Create one below."}
              </div>
            )}
            <ul className="divide-y divide-[var(--border)]">
              {sorted.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/cases/${c.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-100">
                        {c.subject_name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {formatRelativeTime(c.updated_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.risk_score != null && (
                        <span className="text-xs text-amber-500/90">
                          Risk {c.risk_score}
                        </span>
                      )}
                      <CaseStatusIndicator status={c.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="w-[320px] shrink-0 rounded border border-[var(--border)] bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
            New investigation
          </h2>
          <input
            type="text"
            placeholder="Subject name *"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="mb-2 w-full rounded border border-[var(--border)] bg-zinc-800 px-3 py-2 text-sm placeholder:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Current role (optional)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mb-2 w-full rounded border border-[var(--border)] bg-zinc-800 px-3 py-2 text-sm placeholder:text-zinc-500"
          />
          <input
            type="text"
            placeholder="Current organization (optional)"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className="mb-2 w-full rounded border border-[var(--border)] bg-zinc-800 px-3 py-2 text-sm placeholder:text-zinc-500"
          />
          <input
            type="number"
            min={1}
            max={50}
            placeholder="Max iterations (optional)"
            value={maxIterations === "" ? "" : maxIterations}
            onChange={(e) => {
              const v = e.target.value;
              setMaxIterations(v === "" ? "" : Math.min(50, Math.max(1, parseInt(v, 10) || 1)));
            }}
            className="mb-3 w-full rounded border border-[var(--border)] bg-zinc-800 px-3 py-2 text-sm placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!subject.trim() || mutate.isPending}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded border py-2 text-sm font-medium",
              "border-amber-500/60 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
            )}
          >
            {mutate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Run pipeline
          </button>
          <p className="mt-2 text-[10px] text-zinc-500">
            Starts the deep research pipeline. You’ll be taken to the case; use the <strong>Graph</strong> tab to see the connection network and the right panel for the investigation report.
          </p>
        </section>
      </div>
    </div>
  );
}
