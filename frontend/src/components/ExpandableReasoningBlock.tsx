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
    <div className={cn("rounded border border-[var(--border)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-zinc-800/50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
        )}
        <span className="flex-1 truncate">{title}</span>
      </button>
      {open && <div className="border-t border-[var(--border)] px-2 pb-2 pt-1">{content}</div>}
    </div>
  );
}
