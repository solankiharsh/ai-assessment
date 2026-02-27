"use client";

import { useEffect } from "react";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { LeftPanel } from "./LeftPanel";
import { CenterPanel } from "./CenterPanel";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="flex h-full w-full overflow-hidden bg-background">
      {focusMode && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={exitFocusMode}
          className="fixed right-4 top-14 z-50 gap-2 shadow-lg"
          aria-label="Exit focus mode"
        >
          Exit focus
        </Button>
      )}
      {!showLeft && !focusMode && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setLeftOpen(true)}
          className="flex w-10 shrink-0 flex-col gap-1 border-r border-border py-4 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Open left panel"
        >
          <PanelLeftOpen className="h-5 w-5" />
          <span className="text-[10px]">[</span>
        </Button>
      )}
      {showLeft && (
        <div className="flex shrink-0 border-r border-border">
          <LeftPanel caseId={caseId} caseData={caseData} />
        </div>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden",
          showLeft && "border-r border-border"
        )}
      >
        <CenterPanel>{children}</CenterPanel>
      </div>
    </div>
  );
}
