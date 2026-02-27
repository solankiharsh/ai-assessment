"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function getCaseIdFromPath(pathname: string | null): string | null {
  if (!pathname || !pathname.startsWith("/cases/")) return null;
  const rest = pathname.slice("/cases/".length);
  if (!rest || rest.includes("/")) return null;
  return rest;
}

function StatBadge({
  value,
  label,
  danger,
}: {
  value: number | string;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          "font-mono text-sm font-bold",
          danger ? "text-[var(--risk-high)]" : "text-[var(--foreground)]"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
    </div>
  );
}

export function HeaderBar() {
  const pathname = usePathname();
  const caseId = getCaseIdFromPath(pathname);
  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.getCase(caseId!),
    enabled: !!caseId,
  });

  const entities = caseData?.entities?.length ?? 0;
  const riskFlags = caseData?.risk_flags?.length ?? 0;
  const sources = caseData?.search_history?.length ?? 0;

  const navTabs = [
    { href: "/cases", label: "Cases", active: pathname === "/cases" },
    {
      href: caseId ? `/cases/${caseId}` : "/cases",
      label: "Investigation",
      active: !!caseId && pathname?.startsWith("/cases/") && pathname !== "/cases",
    },
    { href: "/phases", label: "Phases", active: pathname === "/phases" },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gradient-to-br from-[var(--accent)] to-[var(--purple)] font-bold text-white"
          aria-hidden
        >
          DR
        </div>
        <div>
          <div className="text-sm font-semibold text-[var(--foreground)]">
            Deep Research Console
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            Investigative Intelligence Platform
          </div>
        </div>
      </div>

      <nav
        className="flex rounded-lg bg-[var(--background)] p-1"
        role="tablist"
      >
        {navTabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            role="tab"
            aria-selected={tab.active}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab.active
                ? "bg-[var(--bg-card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-6">
        <StatBadge
          value={caseData ? entities : "—"}
          label="Entities"
        />
        <StatBadge
          value={caseData ? riskFlags : "—"}
          label="Risk Flags"
          danger={riskFlags > 0}
        />
        <StatBadge
          value={caseData ? sources : "—"}
          label="Sources"
        />
      </div>
    </header>
  );
}
