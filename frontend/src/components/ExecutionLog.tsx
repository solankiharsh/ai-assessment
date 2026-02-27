"use client";

import { useRef, useEffect } from "react";

interface Props {
  logs: string[];
  /** Max height class — default "h-48 sm:h-64" */
  heightClass?: string;
  /** Shown when logs are empty (e.g. completed run with no captured logs). */
  emptyMessage?: string;
}

export function ExecutionLog({
  logs,
  heightClass = "h-48 sm:h-64",
  emptyMessage = "Waiting for agent output…",
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Execution log
        </h3>
        <span className="text-xs text-muted-foreground">
          {logs.length} {logs.length === 1 ? "entry" : "entries"}
        </span>
      </header>
      <div className={`overflow-auto ${heightClass}`}>
        <div className="space-y-1 p-3 font-mono text-[11px] sm:p-4 sm:text-xs">
          {logs.length === 0 ? (
            <p className="rounded py-4 text-center text-muted-foreground italic">
              {emptyMessage}
            </p>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`break-words rounded-md px-2 py-1.5 ${
                  log.includes("FAILED") || log.includes("error") || log.includes("Error")
                    ? "bg-destructive/10 text-destructive"
                    : log.includes("CONTINUE") || log.includes("WARNING")
                      ? "bg-amber-500/10 text-amber-400"
                      : log.includes("complete") || log.includes("✓") || log.includes("done")
                        ? "text-emerald-400/90"
                        : "text-foreground/85"
                }`}
              >
                {log}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
