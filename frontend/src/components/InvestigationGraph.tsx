"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useViewport,
  type Node,
  type NodeTypes,
  type Edge,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GraphLegend } from "./GraphLegend";
import type { EntityType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";

/** Resolve CSS variable values at runtime for inline styles (canvas rendering). */
function resolveCssVar(varExpr: string): string {
  if (typeof window === "undefined") return "#64748b";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varExpr.replace(/^var\(--/, "--").replace(/\)$/, ""))
    .trim() || "#64748b";
}

/** Fixed color palette for entity types (used for canvas-level rendering in ReactFlow). */
const ENTITY_HEX: Record<EntityType, string> = {
  person: "#60A5FA",
  organization: "#A78BFA",
  location: "#22D3EE",
  event: "#FBBF24",
  document: "#94A3B8",
  financial_instrument: "#34D399",
};

/** Default max nodes before we auto-prune for readability. */
const DEFAULT_MAX_NODES = 60;

function CustomNode({
  data,
  selected,
}: {
  data: {
    label?: string;
    type?: EntityType;
    confidence?: number;
    hasRisk?: boolean;
    degree?: number;
  };
  selected?: boolean;
}) {
  const type = data.type ?? "person";
  const color = ENTITY_HEX[type] ?? ENTITY_HEX.person;
  const hasRisk = data.hasRisk ?? false;
  const zoom = useViewport().zoom;
  const showType = zoom >= 0.7;
  const degree = data.degree ?? 0;
  // Scale node size by connectivity
  const scale = Math.min(1.4, 1 + degree * 0.03);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border-2 px-3 py-1.5 text-xs",
        "text-[var(--foreground)]",
        selected && "ring-2 ring-[var(--accent)]"
      )}
      style={{
        backgroundColor: `${color}18`,
        borderColor: color,
        boxShadow: hasRisk
          ? `0 0 14px ${color}88`
          : `0 1px 4px rgba(0,0,0,0.3)`,
        borderRadius:
          type === "person" ? "9999px" : type === "location" ? "4px" : "8px",
        minWidth: `${Math.round(72 * scale)}px`,
        minHeight: `${Math.round(44 * scale)}px`,
        transform: `scale(${scale})`,
      }}
    >
      <div
        className="font-medium truncate text-center"
        style={{ maxWidth: `${Math.round(100 * scale)}px`, fontSize: "11px" }}
      >
        {data.label ?? "?"}
      </div>
      {showType && (
        <div
          className="text-[9px] capitalize mt-0.5"
          style={{ color, opacity: 0.85 }}
        >
          {type.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { custom: CustomNode };

/**
 * Deterministic force-directed layout using a seeded PRNG.
 * This prevents the infinite re-render loop that Math.random() caused.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function runForceLayout(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  width: number,
  height: number,
  iterations = 150
): Map<string, { x: number; y: number }> {
  const rand = seededRandom(
    nodeIds.reduce((h, id) => h + id.charCodeAt(0) + id.length, 42)
  );
  const positions = new Map<string, { x: number; y: number }>();
  nodeIds.forEach((id) => {
    positions.set(id, {
      x: width * (0.1 + 0.8 * rand()),
      y: height * (0.1 + 0.8 * rand()),
    });
  });
  const repel = 12000;
  const attract = 0.035;
  const damp = 0.82;
  const centerGravity = 0.01;
  const cx = width / 2;
  const cy = height / 2;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    nodeIds.forEach((id) => forces.set(id, { fx: 0, fy: 0 }));

    // Repulsion
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        const pa = positions.get(a)!;
        const pb = positions.get(b)!;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = repel / (d * d);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        forces.get(a)!.fx -= fx;
        forces.get(a)!.fy -= fy;
        forces.get(b)!.fx += fx;
        forces.get(b)!.fy += fy;
      }
    }

    // Attraction along edges
    edges.forEach(({ source, target }) => {
      if (!positions.has(source) || !positions.has(target)) return;
      const pa = positions.get(source)!;
      const pb = positions.get(target)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = d * attract;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      forces.get(source)!.fx += fx;
      forces.get(source)!.fy += fy;
      forces.get(target)!.fx -= fx;
      forces.get(target)!.fy -= fy;
    });

    // Center gravity
    nodeIds.forEach((id) => {
      const pos = positions.get(id)!;
      const force = forces.get(id)!;
      force.fx += (cx - pos.x) * centerGravity;
      force.fy += (cy - pos.y) * centerGravity;
    });

    // Apply forces
    nodeIds.forEach((id) => {
      const pos = positions.get(id)!;
      const force = forces.get(id)!;
      pos.x = pos.x + force.fx * damp;
      pos.y = pos.y + force.fy * damp;
      pos.x = Math.max(40, Math.min(width - 40, pos.x));
      pos.y = Math.max(40, Math.min(height - 40, pos.y));
    });
  }

  return positions;
}

type GraphNode = {
  id: string;
  label: string;
  type: EntityType;
  data?: Record<string, unknown>;
};
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  confidence?: number;
};

/**
 * Select the top-N most connected nodes for display.
 * Always includes: the subject entity, risk-flagged entities, and their 1-hop neighbors.
 */
function selectTopNodes(
  allNodes: GraphNode[],
  allEdges: GraphEdge[],
  riskEntityIds: Set<string>,
  maxNodes: number,
  filterType: EntityType | null,
  confidenceThreshold: number
): Set<string> {
  // Compute degree per node
  const degree = new Map<string, number>();
  allNodes.forEach((n) => degree.set(n.id, 0));
  allEdges.forEach((e) => {
    if ((e.confidence ?? 1) < confidenceThreshold) return;
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  });

  // Apply type filter
  const candidates = filterType
    ? allNodes.filter((n) => n.type === filterType)
    : allNodes;

  // Apply confidence filter
  const confFiltered = candidates.filter(
    (n) =>
      ((n.data as { confidence?: number })?.confidence ?? 1) >=
      confidenceThreshold
  );

  // Priority: risk entities first, then by degree
  const sorted = [...confFiltered].sort((a, b) => {
    const aRisk = riskEntityIds.has(a.id) ? 1 : 0;
    const bRisk = riskEntityIds.has(b.id) ? 1 : 0;
    if (aRisk !== bRisk) return bRisk - aRisk;
    return (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
  });

  const selected = new Set<string>();
  // Always include risk-flagged entities
  sorted.forEach((n) => {
    if (riskEntityIds.has(n.id)) selected.add(n.id);
  });

  // Fill up to maxNodes with highest-degree nodes
  for (const n of sorted) {
    if (selected.size >= maxNodes) break;
    selected.add(n.id);
  }

  // Add 1-hop neighbors of risk entities (up to limit)
  const neighborBudget = Math.max(0, maxNodes - selected.size);
  if (neighborBudget > 0) {
    const neighbors: string[] = [];
    allEdges.forEach((e) => {
      if ((e.confidence ?? 1) < confidenceThreshold) return;
      if (riskEntityIds.has(e.source) && !selected.has(e.target))
        neighbors.push(e.target);
      if (riskEntityIds.has(e.target) && !selected.has(e.source))
        neighbors.push(e.source);
    });
    neighbors.slice(0, neighborBudget).forEach((id) => selected.add(id));
  }

  return selected;
}

interface InvestigationGraphProps {
  caseId: string;
  onNodeSelect?: (entityId: string) => void;
  riskEntityIds?: Set<string>;
}

export function InvestigationGraph({
  caseId,
  onNodeSelect,
  riskEntityIds = new Set(),
}: InvestigationGraphProps) {
  const confidenceThreshold = useUIStore((s) => s.confidenceThreshold);
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | null>(
    null
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [maxNodes, setMaxNodes] = useState(DEFAULT_MAX_NODES);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["graph", caseId],
    queryFn: () => api.getGraph(caseId),
  });

  const rawNodes: GraphNode[] = data?.nodes ?? [];
  const rawEdges: GraphEdge[] = data?.edges ?? [];

  // Compute degree map once
  const degreeMap = useMemo(() => {
    const d = new Map<string, number>();
    rawNodes.forEach((n) => d.set(n.id, 0));
    rawEdges.forEach((e) => {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    });
    return d;
  }, [rawNodes, rawEdges]);

  // Select visible node IDs (pruned to top-N)
  const visibleNodeIds = useMemo(() => {
    if (!rawNodes.length) return new Set<string>();

    // If focused on a node, show its 2-hop neighborhood
    if (focusedNodeId) {
      const oneHop = new Set<string>([focusedNodeId]);
      rawEdges.forEach((e) => {
        if ((e.confidence ?? 1) < confidenceThreshold) return;
        if (e.source === focusedNodeId) oneHop.add(e.target);
        if (e.target === focusedNodeId) oneHop.add(e.source);
      });
      // Also add 2nd-hop neighbors for context
      const twoHop = new Set(oneHop);
      rawEdges.forEach((e) => {
        if ((e.confidence ?? 1) < confidenceThreshold) return;
        if (oneHop.has(e.source) && !twoHop.has(e.target) && twoHop.size < 40)
          twoHop.add(e.target);
        if (oneHop.has(e.target) && !twoHop.has(e.source) && twoHop.size < 40)
          twoHop.add(e.source);
      });
      return twoHop;
    }

    // If searching, filter by name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matched = new Set(
        rawNodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)
      );
      // Add their 1-hop neighbors
      rawEdges.forEach((e) => {
        if (matched.has(e.source)) matched.add(e.target);
        if (matched.has(e.target)) matched.add(e.source);
      });
      return matched;
    }

    return selectTopNodes(
      rawNodes,
      rawEdges,
      riskEntityIds,
      maxNodes,
      entityTypeFilter,
      confidenceThreshold
    );
  }, [
    rawNodes,
    rawEdges,
    riskEntityIds,
    maxNodes,
    entityTypeFilter,
    confidenceThreshold,
    focusedNodeId,
    searchQuery,
  ]);

  const visibleEdges = useMemo(() => {
    return rawEdges.filter(
      (e) =>
        visibleNodeIds.has(e.source) &&
        visibleNodeIds.has(e.target) &&
        (e.confidence ?? 1) >= confidenceThreshold
    );
  }, [rawEdges, visibleNodeIds, confidenceThreshold]);

  // Stable fingerprint to prevent re-layout when nothing changed
  const layoutFingerprint = useMemo(() => {
    const ids = [...visibleNodeIds].sort().join(",");
    const edgeIds = visibleEdges.map((e) => e.id).sort().join(",");
    return `${ids}|${edgeIds}`;
  }, [visibleNodeIds, visibleEdges]);

  const layoutSize = Math.max(600, Math.sqrt(visibleNodeIds.size) * 220);

  const positions = useMemo(() => {
    const ids = [...visibleNodeIds];
    if (ids.length === 0) return new Map<string, { x: number; y: number }>();
    return runForceLayout(
      ids,
      visibleEdges.map((e) => ({ source: e.source, target: e.target })),
      layoutSize,
      layoutSize,
      Math.min(200, 80 + ids.length * 2)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutFingerprint, layoutSize]);

  // Build ReactFlow nodes and edges (memoized, stable)
  const flowNodes: Node[] = useMemo(() => {
    if (!rawNodes.length) return [];
    const span = Math.max(400, Math.sqrt(visibleNodeIds.size) * 220);
    return rawNodes
      .filter((n) => visibleNodeIds.has(n.id))
      .map((n) => {
        const pos = positions.get(n.id) ?? {
          x: Math.random() * span,
          y: Math.random() * span,
        };
        return {
          id: n.id,
          type: "custom" as const,
          position: pos,
          data: {
            label: n.label,
            type: n.type,
            confidence: (n.data as { confidence?: number })?.confidence,
            hasRisk: riskEntityIds.has(n.id),
            degree: degreeMap.get(n.id) ?? 0,
          },
        };
      });
  }, [rawNodes, visibleNodeIds, positions, riskEntityIds, degreeMap]);

  const flowEdges: Edge[] = useMemo(() => {
    return visibleEdges.map((e) => {
      const conf = e.confidence ?? 1;
      const label = e.label
        ? e.label.replace(/_/g, " ").toLowerCase()
        : undefined;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep" as const,
        label: label,
        labelStyle: {
          fontSize: 9,
          fill: "var(--text-secondary)",
          fontWeight: 500,
        },
        labelShowBg: true,
        labelBgStyle: {
          fill: "var(--bg-card)",
          fillOpacity: 0.9,
        },
        labelBgBorderRadius: 3,
        labelBgPadding: [3, 5] as [number, number],
        animated: conf < 0.5,
        style: {
          stroke: conf >= 0.7 ? "var(--text-secondary)" : "var(--muted)",
          strokeWidth: conf >= 0.7 ? 1.5 : 1,
          strokeDasharray: conf < 0.5 ? "5 5" : undefined,
        },
      };
    });
  }, [visibleEdges]);

  // Use useNodesState for drag support. Initialize once, sync via fingerprint.
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);
  const prevFingerprintRef = useRef(layoutFingerprint);

  // Sync only when the data fingerprint actually changes — prevents infinite loop
  useEffect(() => {
    if (prevFingerprintRef.current !== layoutFingerprint) {
      prevFingerprintRef.current = layoutFingerprint;
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [layoutFingerprint, flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setFocusedNodeId(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  const showFullGraph = useCallback(() => {
    setFocusedNodeId(null);
    setSearchQuery("");
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        Loading graph...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--risk-high)]">
        Failed to load graph.
      </div>
    );
  }
  if (!data?.nodes?.length) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        No entities to display. Run an investigation to build the graph.
      </div>
    );
  }

  const totalNodes = rawNodes.length;
  const shownNodes = visibleNodeIds.size;
  const isPruned = shownNodes < totalNodes && !focusedNodeId && !searchQuery.trim();

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
        className="react-flow-dark"
      >
        <Background color="var(--muted)" gap={16} size={1} />
        <Controls className="!bottom-2 !left-2 !bg-[var(--bg-card)] !border-[var(--border)]" />
        <MiniMap
          className="!bg-[var(--bg-card)] !border-[var(--border)]"
          nodeColor={(n) => ENTITY_HEX[(n.data?.type as EntityType) ?? "person"] ?? "#64748b"}
          maskColor="rgba(11, 15, 25, 0.7)"
        />

        {/* Top-left: search + controls */}
        <Panel position="top-left" className="flex flex-col gap-2 max-w-[240px]">
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
            <span>
              {shownNodes}/{totalNodes} entities
            </span>
            {isPruned && (
              <span>
                (top {maxNodes})
              </span>
            )}
          </div>
          {isPruned && (
            <div className="flex gap-1">
              {[30, 60, 100, totalNodes].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxNodes(n)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px]",
                    maxNodes === n
                      ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-hover)]"
                  )}
                >
                  {n === totalNodes ? "All" : n}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Top-right: legend + reset */}
        <Panel position="top-right" className="flex flex-col gap-2">
          {(focusedNodeId || searchQuery.trim()) && (
            <button
              type="button"
              onClick={showFullGraph}
              className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs font-medium text-[var(--foreground)] shadow hover:bg-[var(--bg-hover)]"
            >
              Show full graph
            </button>
          )}
          <GraphLegend
            onFilter={(t) => setEntityTypeFilter(t ?? null)}
            activeType={entityTypeFilter}
          />
        </Panel>
      </ReactFlow>
    </div>
  );
}
