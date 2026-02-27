"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Entity } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  entities: Entity[];
  caseId: string;
}

export function CommandPalette({
  open,
  onClose,
  entities,
  caseId,
}: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const router = useRouter();

  const filtered = q.trim()
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(q.toLowerCase()) ||
          e.entity_type.toLowerCase().includes(q.toLowerCase())
      )
    : entities.slice(0, 20);

  const select = useCallback(
    (entity: Entity) => {
      router.push(`/cases/${caseId}?entity=${encodeURIComponent(entity.id)}&tab=entities`);
      onClose();
      setQ("");
      setIndex(0);
    },
    [caseId, router, onClose]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => (i + 1) % Math.max(1, filtered.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
        return;
      }
      if (e.key === "Enter" && filtered[index]) {
        e.preventDefault();
        select(filtered[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, filtered, index, select]);

  useEffect(() => {
    setIndex(0);
  }, [q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
      role="dialog"
      aria-label="Command palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded border border-[var(--border)] bg-[#0c0c0e] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to entity…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
            autoFocus
          />
          <span className="text-[10px] text-zinc-500">Esc to close</span>
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-zinc-500">
              No entities match.
            </li>
          )}
          {filtered.map((entity, i) => (
            <li key={entity.id}>
              <button
                type="button"
                onClick={() => select(entity)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                  i === index ? "bg-amber-500/20 text-amber-400" : "hover:bg-zinc-800"
                )}
              >
                <span className="truncate">{entity.name}</span>
                <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {entity.entity_type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}