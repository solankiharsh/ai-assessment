"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { LeftPanel } from "./LeftPanel";
import { CenterPanel } from "./CenterPanel";
import { PanelLeftOpen } from "lucide-react";
import type { Investigation } from "@/lib/types";

interface ConsoleLayoutProps {
  caseId?: string | null;
  caseData?: Investigation | null;
  children: React.ReactNode;
}

export function ConsoleLayout({
  caseId,
  caseData,
  children,
}: ConsoleLayoutProps) {
  const leftOpen = useUIStore((s) => s.leftPanelOpen);
  const focusMode = useUIStore((s) => s.focusMode);
  const setLeftOpen = useUIStore((s) => s.setLeftPanelOpen);
  const exitFocusMode = useUIStore((s) => s.exitFocusMode);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);

  const showLeft = leftOpen && !focusMode;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const raw = e.target;
      const el =
        raw instanceof Element ? raw : (raw as Node)?.parentElement ?? null;
      if (!el) return;
      const isInput =
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.getAttribute("contenteditable") === "true";
      if (isInput) return;
      if (e.key === "Escape") {
        exitFocusMode();
        return;
      }
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleLeftPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitFocusMode, toggleLeftPanel]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--background)]">
      {focusMode && (
        <button
          type="button"
          onClick={exitFocusMode}
          className="fixed right-4 top-14 z-50 flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-lg hover:bg-[var(--bg-hover)]"
          aria-label="Exit focus mode"
        >
          Exit focus
        </button>
      )}
      {!showLeft && !focusMode && (
        <button
          type="button"
          onClick={() => setLeftOpen(true)}
          className="flex w-10 shrink-0 flex-col items-center justify-center gap-1 border-r border-[var(--border)] bg-[var(--bg-secondary)] py-4 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
          aria-label="Open left panel"
        >
          <PanelLeftOpen className="h-5 w-5" />
          <span className="text-[10px]">[</span>
        </button>
      )}
      {showLeft && (
        <div className="flex shrink-0 border-r border-[var(--border)]">
          <LeftPanel caseId={caseId} caseData={caseData} />
        </div>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden",
          showLeft && "border-r border-[var(--border)]"
        )}
      >
        <CenterPanel>{children}</CenterPanel>
      </div>
    </div>
  );
}
