"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Investigation, EntityType } from "@/lib/types";
import { EntityCard } from "../EntityCard";
import { FilterChipSystem } from "../FilterChipSystem";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "organization", label: "Organization" },
  { value: "location", label: "Location" },
  { value: "event", label: "Event" },
  { value: "document", label: "Document" },
  { value: "financial_instrument", label: "Financial" },
];

export function TabEntities({ investigation: inv }: { investigation: Investigation }) {
  const selectedId = useUIStore((s) => s.selectedEntityId);
  const setSelectedId = useUIStore((s) => s.setSelectedEntityId);
  const confidenceThreshold = useUIStore((s) => s.confidenceThreshold);
  const [typeFilter, setTypeFilter] = useState<EntityType | null>(null);

  const filtered = useMemo(() => {
    let list = inv.entities ?? [];
    if (typeFilter) list = list.filter((e) => e.entity_type === typeFilter);
    list = list.filter((e) => e.confidence >= confidenceThreshold);
    return list;
  }, [inv.entities, typeFilter, confidenceThreshold]);

  const selectedEntity = useMemo(
    () => inv.entities?.find((e) => e.id === selectedId),
    [inv.entities, selectedId]
  );

  const [expandOutgoing, setExpandOutgoing] = useState(false);
  const [expandIncoming, setExpandIncoming] = useState(false);
  useEffect(() => {
    setExpandOutgoing(false);
    setExpandIncoming(false);
  }, [selectedId]);

  const connectionsForEntity = useMemo(() => {
    if (!selectedId) return { in: [], out: [] };
    const out = (inv.connections ?? []).filter((c) => c.source_entity_id === selectedId);
    const in_ = (inv.connections ?? []).filter((c) => c.target_entity_id === selectedId);
    return { in: in_, out };
  }, [selectedId, inv.connections]);

  /** Resolve entity ID → display name for human-readable connection labels. */
  const entityNameById = useMemo(() => {
    const map = new Map<string, string>();
    (inv.entities ?? []).forEach((e) => map.set(e.id, e.name || e.id));
    return map;
  }, [inv.entities]);

  const formatRelationship = (r: string) =>
    r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border)]">
        <div className="border-b border-[var(--border)] p-2">
          <FilterChipSystem
            options={ENTITY_TYPE_OPTIONS}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
          />
        </div>
        <motion.ul
          className="flex-1 overflow-y-auto p-2"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.03 } },
            hidden: {},
          }}
        >
          {filtered.map((e) => (
            <motion.li
              key={e.id}
              className="mb-1.5"
              variants={{
                hidden: { opacity: 0, y: 6 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <EntityCard
                entity={e}
                selected={selectedId === e.id}
                onSelect={() => setSelectedId(e.id)}
                compact
              />
            </motion.li>
          ))}
          {filtered.length === 0 && (
            <li className="py-4 text-center text-xs text-[var(--muted)]">
              No entities match filters.
            </li>
          )}
        </motion.ul>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        {selectedEntity ? (
          <>
            <EntityCard
              entity={selectedEntity}
              connections={inv.connections}
              riskFlags={inv.risk_flags}
            />
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Connections
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-[var(--muted)]">Outgoing</div>
                  <ul className="mt-1 space-y-1">
                    {(expandOutgoing
                      ? connectionsForEntity.out
                      : connectionsForEntity.out.slice(0, 10)
                    ).map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        {formatRelationship(c.relationship_type)} →{" "}
                        {entityNameById.get(c.target_entity_id) ?? c.target_entity_id}
                        {c.confidence != null && c.confidence !== 1 && (
                          <span
                            className="rounded px-1 py-0.5 text-[10px] text-[var(--muted)] bg-[var(--bg-elevated)]"
                            title="Connection confidence"
                          >
                            {(c.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </li>
                    ))}
                    {connectionsForEntity.out.length > 10 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setExpandOutgoing((v) => !v)}
                          className="text-xs text-[var(--accent)] hover:underline focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded"
                        >
                          {expandOutgoing
                            ? "Show less"
                            : `+${connectionsForEntity.out.length - 10} more`}
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-[var(--muted)]">Incoming</div>
                  <ul className="mt-1 space-y-1">
                    {(expandIncoming
                      ? connectionsForEntity.in
                      : connectionsForEntity.in.slice(0, 10)
                    ).map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        {entityNameById.get(c.source_entity_id) ?? c.source_entity_id} →{" "}
                        {formatRelationship(c.relationship_type)}
                        {c.confidence != null && c.confidence !== 1 && (
                          <span
                            className="rounded px-1 py-0.5 text-[10px] text-[var(--muted)] bg-[var(--bg-elevated)]"
                            title="Connection confidence"
                          >
                            {(c.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </li>
                    ))}
                    {connectionsForEntity.in.length > 10 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setExpandIncoming((v) => !v)}
                          className="text-xs text-[var(--accent)] hover:underline focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded"
                        >
                          {expandIncoming
                            ? "Show less"
                            : `+${connectionsForEntity.in.length - 10} more`}
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            Select an entity from the list.
          </div>
        )}
      </div>
    </div>
  );
}