"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Shield, Search, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function getCaseIdFromPath(pathname: string | null): string | null {
  if (!pathname || !pathname.startsWith("/cases/")) return null;
  const rest = pathname.slice("/cases/".length);
  if (!rest || rest.includes("/")) return null;
  return rest;
}

function StatPill({
  value,
  label,
  variant,
}: {
  value: number | string;
  label: string;
  variant?: "danger" | "default";
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1.5 font-mono text-xs font-semibold",
        variant === "danger" && "border-destructive/50 text-destructive"
      )}
    >
      <span>{value}</span>
      <span className="font-normal text-muted-foreground">{label}</span>
    </Badge>
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

  const navItems = [
    { href: "/cases", label: "Investigations", active: pathname === "/cases" },
    {
      href: caseId ? `/cases/${caseId}` : "/cases",
      label: "Analysis",
      active: !!caseId && pathname?.startsWith("/cases/") && pathname !== "/cases",
    },
    { href: "/phases", label: "Methodology", active: pathname === "/phases" },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Link href="/cases" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/50">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="hidden sm:block">
            <span className="text-sm font-semibold text-foreground">
              Deep Research
            </span>
          </div>
        </Link>

        <div className="mx-2 h-5 w-px bg-border" />

        <nav className="flex items-center gap-1" role="tablist">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="tab"
              aria-selected={item.active}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                item.active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {caseData && (
          <div className="hidden items-center gap-2 md:flex">
            <StatPill value={entities} label="entities" />
            <StatPill
              value={riskFlags}
              label="risks"
              variant={riskFlags > 0 ? "danger" : "default"}
            />
            <StatPill value={sources} label="sources" />
          </div>
        )}

        <a
          href="https://github.com/solankiharsh/ai-assessment"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
          title="View source on GitHub"
        >
          <Github className="h-4 w-4" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true })
            );
          }}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
      </div>
    </header>
  );
}
