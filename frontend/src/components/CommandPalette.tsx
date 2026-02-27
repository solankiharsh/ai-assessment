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
      router.push(
        `/cases/${caseId}?entity=${encodeURIComponent(entity.id)}&tab=entities`
      );
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
        setIndex(
          (i) => (i - 1 + filtered.length) % Math.max(1, filtered.length)
        );
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

  const TYPE_COLORS: Record<string, string> = {
    person: "var(--entity-person)",
    organization: "var(--entity-org)",
    location: "var(--entity-location)",
    event: "var(--entity-event)",
    document: "var(--entity-document)",
    financial_instrument: "var(--entity-financial)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      role="dialog"
      aria-label="Command palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search entities..."
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]">
            Esc
          </kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              No entities match
            </li>
          )}
          {filtered.map((entity, i) => {
            const color =
              TYPE_COLORS[entity.entity_type] ?? "var(--muted)";
            return (
              <li key={entity.id}>
                <button
                  type="button"
                  onClick={() => select(entity)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                    i === index
                      ? "bg-[var(--bg-hover)] text-[var(--foreground)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
                  )}
                >
                  <span className="truncate">{entity.name}</span>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase"
                    style={{
                      backgroundColor: `${color}15`,
                      color,
                    }}
                  >
                    {entity.entity_type.replace(/_/g, " ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
