"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExpandableReasoningBlock({
  title,
  content,
  defaultOpen = false,
  className,
}: {
  title: string;
  content: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-card)]"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
        )}
        <span className="flex-1 truncate text-[var(--text-secondary)]">
          {title}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 pb-2.5 pt-2">
          {content}
        </div>
      )}
    </div>
  );
}
