/**
 * InvestigationGraph — React Flow graph matching deriv-ai-research-agent's visual style:
 *   - Solid colored circles with icons (color-coded by entity type)
 *   - Target entity as a larger red circle with amber ring
 *   - Edges colored by confidence (green=high, yellow=medium, red=low)
 *   - Left legend panel (Node Types + Edge Confidence)
 *   - Right stats panel (target name, counts)
 *   - Force-directed layout (no dagre dependency)
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeTypes,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EntityType } from "@/lib/types";

/* ── Entity color palette (matches deriv's colors) ─────────────── */
const ENTITY_COLORS: Record<string, string> = {
  person: "#3b82f6",   // blue-500
  organization: "#f59e0b",   // amber-500
  event: "#22c55e",   // green-500
  document: "#a78bfa",   // violet-400
  location: "#f43f5e",   // rose-500
  financial_instrument: "#06b6d4",   // cyan-500
};

const ENTITY_LABELS: Record<string, string> = {
  person: "Person",
  organization: "Organization",
  event: "Event",
  document: "Filing",
  location: "Location",
  financial_instrument: "Financial",
};

function getConfidenceColor(conf: number): string {
  if (conf >= 0.7) return "#22c55e";  // green high
  if (conf >= 0.4) return "#f59e0b";  // amber medium
  return "#ef4444";                    // red low
}

/* ── Tiny SVG icons per entity type ────────────────────────────── */
const ENTITY_ICONS: Record<string, React.ReactNode> = {
  person: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  organization: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
  event: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  location: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  financial_instrument: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
};

const TARGET_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

/* ── Custom node components ─────────────────────────────────────── */
interface NodeData extends Record<string, unknown> {
  label: string;
  color: string;
  isTarget: boolean;
  entityType: string;
  hasRisk: boolean;
}

const SIZE = 40;
const TARGET_SIZE = 56;

function EntityNodeComponent({ data }: { data: NodeData }) {
  const size = data.isTarget ? TARGET_SIZE : SIZE;
  const color = data.isTarget ? "#ef4444" : data.color;
  const icon = data.isTarget ? TARGET_ICON : ENTITY_ICONS[data.entityType];

  return (
    <div className="group relative cursor-pointer" style={{ width: size, height: size }}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />

      {/* Solid filled circle */}
      <div
        className="flex items-center justify-center rounded-full text-white/90 transition-transform duration-200 group-hover:scale-110"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          boxShadow: data.isTarget
            ? `0 0 0 3px #f59e0b, 0 0 16px ${color}80`
            : data.hasRisk
              ? `0 0 14px ${color}80`
              : `0 0 8px ${color}40`,
        }}
      >
        <div style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}>
          {icon}
        </div>
      </div>

      {/* Label below circle */}
      <p
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[96px] truncate text-center text-[10px] font-medium leading-tight whitespace-nowrap text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]"
        style={{ top: size + 4 }}
      >
        {data.label}
      </p>

      {/* Hover tooltip */}
      <div
        className="pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-orange-500/20 bg-neutral-950/95 px-3 py-2 text-xs backdrop-blur-sm group-hover:block shadow-xl"
        style={{ top: size + 22 }}
      >
        <p className="font-semibold text-white">{data.label}</p>
        <p className="capitalize text-orange-400/80">{data.isTarget ? "Target" : data.entityType}</p>
        {data.hasRisk && <p className="text-red-400">⚠ Risk flagged</p>}
      </div>
    </div>
  );
}

const EntityNode = memo(EntityNodeComponent);
const nodeTypes: NodeTypes = { entityNode: EntityNode };

/* ── Force layout (seeded, deterministic) ───────────────────────── */
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function runForceLayout(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  width: number, height: number, iters = 160
): Map<string, { x: number; y: number }> {
  const rand = seededRandom(nodeIds.reduce((h, id) => h + id.charCodeAt(0), 42));
  const pos = new Map(nodeIds.map((id) => [id, { x: width * (0.1 + 0.8 * rand()), y: height * (0.1 + 0.8 * rand()) }]));

  for (let i = 0; i < iters; i++) {
    const forces = new Map(nodeIds.map((id) => [id, { fx: 0, fy: 0 }]));

    // Repulsion
    for (let a = 0; a < nodeIds.length; a++) {
      for (let b = a + 1; b < nodeIds.length; b++) {
        const pa = pos.get(nodeIds[a])!;
        const pb = pos.get(nodeIds[b])!;
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = 14000 / (d * d);
        forces.get(nodeIds[a])!.fx -= (dx / d) * f;
        forces.get(nodeIds[a])!.fy -= (dy / d) * f;
        forces.get(nodeIds[b])!.fx += (dx / d) * f;
        forces.get(nodeIds[b])!.fy += (dy / d) * f;
      }
    }
    // Attraction
    edges.forEach(({ source, target }) => {
      if (!pos.has(source) || !pos.has(target)) return;
      const pa = pos.get(source)!, pb = pos.get(target)!;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = d * 0.04;
      forces.get(source)!.fx += (dx / d) * f;
      forces.get(source)!.fy += (dy / d) * f;
      forces.get(target)!.fx -= (dx / d) * f;
      forces.get(target)!.fy -= (dy / d) * f;
    });
    // Center gravity + apply
    const cx = width / 2, cy = height / 2;
    nodeIds.forEach((id) => {
      const p = pos.get(id)!;
      const f = forces.get(id)!;
      f.fx += (cx - p.x) * 0.012;
      f.fy += (cy - p.y) * 0.012;
      p.x = Math.max(60, Math.min(width - 60, p.x + f.fx * 0.82));
      p.y = Math.max(60, Math.min(height - 60, p.y + f.fy * 0.82));
    });
  }
  return pos;
}

/* ── Main component ─────────────────────────────────────────────── */
interface Props {
  caseId: string;
  onNodeSelect?: (entityId: string) => void;
  riskEntityIds?: Set<string>;
}

type RawNode = { id: string; label: string; type: EntityType; data?: Record<string, unknown> };
type RawEdge = { id: string; source: string; target: string; label?: string; confidence?: number };

export function InvestigationGraph({ caseId, onNodeSelect, riskEntityIds = new Set() }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const MAX_NODES = 80;

  const { data, isLoading, error } = useQuery({
    queryKey: ["graph", caseId],
    queryFn: () => api.getGraph(caseId),
  });

  const rawNodes: RawNode[] = data?.nodes ?? [];
  const rawEdges: RawEdge[] = data?.edges ?? [];

  // Determine target node (highest degree)
  const degreeMap = useMemo(() => {
    const d = new Map<string, number>();
    rawNodes.forEach((n) => d.set(n.id, 0));
    rawEdges.forEach((e) => {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    });
    return d;
  }, [rawNodes, rawEdges]);

  const targetNodeId = useMemo(() => {
    let best = rawNodes[0]?.id ?? null;
    let bestDeg = 0;
    rawNodes.forEach((n) => {
      const d = degreeMap.get(n.id) ?? 0;
      if (n.type === "person" && d > bestDeg) { best = n.id; bestDeg = d; }
    });
    return best;
  }, [rawNodes, degreeMap]);

  // Visible node selection
  const visibleNodeIds = useMemo(() => {
    if (!rawNodes.length) return new Set<string>();
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matched = new Set(rawNodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
      rawEdges.forEach((e) => {
        if (matched.has(e.source)) matched.add(e.target);
        if (matched.has(e.target)) matched.add(e.source);
      });
      return matched;
    }
    if (focusedNodeId) {
      const oneHop = new Set<string>([focusedNodeId]);
      rawEdges.forEach((e) => {
        if (e.source === focusedNodeId) oneHop.add(e.target);
        if (e.target === focusedNodeId) oneHop.add(e.source);
      });
      return oneHop;
    }
    // Top N by degree — always include target + risk nodes
    const sorted = [...rawNodes].sort((a, b) => {
      const ar = riskEntityIds.has(a.id) ? 1000 : 0;
      const br = riskEntityIds.has(b.id) ? 1000 : 0;
      return (br + (degreeMap.get(b.id) ?? 0)) - (ar + (degreeMap.get(a.id) ?? 0));
    });
    const s = new Set<string>();
    if (targetNodeId) s.add(targetNodeId);
    for (const n of sorted) {
      if (s.size >= MAX_NODES) break;
      s.add(n.id);
    }
    return s;
  }, [rawNodes, rawEdges, riskEntityIds, degreeMap, focusedNodeId, searchQuery, targetNodeId]);

  const visibleEdges = useMemo(() =>
    rawEdges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [rawEdges, visibleNodeIds]);

  // Results overview (Neo4j-style): nodes and relationships by type for the visible graph
  const overview = useMemo(() => {
    const nodeCountByType: Record<string, number> = {};
    rawNodes
      .filter((n) => visibleNodeIds.has(n.id))
      .forEach((n) => {
        const t = n.type ?? "unknown";
        nodeCountByType[t] = (nodeCountByType[t] ?? 0) + 1;
      });
    const relCountByLabel: Record<string, number> = {};
    visibleEdges.forEach((e) => {
      const label = (e.label ?? "related").toString().replace(/_/g, " ").toLowerCase();
      relCountByLabel[label] = (relCountByLabel[label] ?? 0) + 1;
    });
    return { nodeCountByType, relCountByLabel };
  }, [rawNodes, visibleNodeIds, visibleEdges]);

  const layoutSize = Math.max(700, Math.sqrt(visibleNodeIds.size) * 200);

  const fingerprint = useMemo(() =>
    [...visibleNodeIds].sort().join(",") + "|" + visibleEdges.map((e) => e.id).sort().join(","),
    [visibleNodeIds, visibleEdges]);

  const positions = useMemo(() => {
    const ids = [...visibleNodeIds];
    if (!ids.length) return new Map<string, { x: number; y: number }>();
    return runForceLayout(ids, visibleEdges.map((e) => ({ source: e.source, target: e.target })), layoutSize, layoutSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, layoutSize]);

  const flowNodes: Node[] = useMemo(() =>
    rawNodes
      .filter((n) => visibleNodeIds.has(n.id))
      .map((n) => {
        const pos = positions.get(n.id) ?? { x: Math.random() * layoutSize, y: Math.random() * layoutSize };
        const isTarget = n.id === targetNodeId;
        return {
          id: n.id,
          type: "entityNode" as const,
          position: pos,
          data: {
            label: n.label,
            color: ENTITY_COLORS[n.type] ?? "#64748b",
            isTarget,
            entityType: n.type,
            hasRisk: riskEntityIds.has(n.id),
          },
        };
      }),
    [rawNodes, visibleNodeIds, positions, riskEntityIds, targetNodeId, layoutSize]);

  const flowEdges: Edge[] = useMemo(() =>
    visibleEdges.map((e) => {
      const conf = e.confidence ?? 0.8;
      const color = getConfidenceColor(conf);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "default" as const,
        animated: conf >= 0.9,
        label: e.label?.replace(/_/g, " ").toLowerCase().slice(0, 25),
        labelStyle: { fill: "#e5e5e5", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#171717", fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: color,
          strokeWidth: Math.max(1.5, conf * 2.5),
          strokeDasharray: conf < 0.4 ? "5 5" : undefined,
        },
      };
    }),
    [visibleEdges]);

  const prevFingerprint = useRef(fingerprint);
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    if (prevFingerprint.current !== fingerprint) {
      prevFingerprint.current = fingerprint;
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [fingerprint, flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (selectedNodeId === node.id) {
        setSelectedNodeId(null);
        setNodes((ns) => ns.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } })));
        setEdges((es) => es.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } })));
        return;
      }
      setSelectedNodeId(node.id);
      setFocusedNodeId(node.id);
      onNodeSelect?.(node.id);
      const connected = new Set<string>([node.id]);
      edges.forEach((e) => {
        if (e.source === node.id) connected.add(e.target);
        if (e.target === node.id) connected.add(e.source);
      });
      setNodes((ns) => ns.map((n) => ({ ...n, style: { ...n.style, opacity: connected.has(n.id) ? 1 : 0.15 } })));
      setEdges((es) => es.map((e) => ({ ...e, style: { ...e.style, opacity: e.source === node.id || e.target === node.id ? 1 : 0.1 } })));
    },
    [selectedNodeId, edges, setNodes, setEdges, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeId) {
      setSelectedNodeId(null);
      setFocusedNodeId(null);
      setNodes((ns) => ns.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } })));
      setEdges((es) => es.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } })));
    }
  }, [selectedNodeId, setNodes, setEdges]);

  if (isLoading) return (
    <div className="flex h-full items-center justify-center text-neutral-500">Loading graph…</div>
  );
  if (error) return (
    <div className="flex h-full items-center justify-center text-red-400">Failed to load graph.</div>
  );
  if (!rawNodes.length) return (
    <div className="flex h-full items-center justify-center text-neutral-500">
      No entities to display. Run an investigation to build the graph.
    </div>
  );

  const targetNode = rawNodes.find((n) => n.id === targetNodeId);
  const totalNodes = rawNodes.length;
  const shownNodes = visibleNodeIds.size;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/10">
      {/* Top search bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-neutral-950/90 px-3 py-2 backdrop-blur-sm">
        <svg className="h-3.5 w-3.5 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search entities…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-xs text-white placeholder:text-neutral-600 focus:outline-none"
        />
        <span className="text-[10px] text-neutral-600 shrink-0">{shownNodes}/{totalNodes}</span>
        {(focusedNodeId || searchQuery) && (
          <button
            onClick={() => {
              setFocusedNodeId(null); setSearchQuery(""); setSelectedNodeId(null);
              setNodes((ns) => ns.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } })));
              setEdges((es) => es.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } })));
            }}
            className="text-[10px] text-orange-400 hover:text-orange-300 shrink-0"
          >
            Reset
          </button>
        )}
      </div>

      {/* Legend — top-left */}
      <div className="absolute left-3 top-12 z-10 rounded-lg border border-white/10 bg-neutral-950/90 p-2.5 text-[10px] backdrop-blur-sm sm:text-xs">
        <p className="mb-1.5 font-semibold text-neutral-200">Node Types</p>
        {Object.entries(ENTITY_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5 py-0.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ENTITY_COLORS[type] }} />
            <span className="text-neutral-400">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 py-0.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-amber-400" />
          <span className="text-neutral-400">Target</span>
        </div>
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="mb-1 font-semibold text-neutral-200">Edge Confidence</p>
          <div className="flex items-center gap-1.5 py-0.5">
            <div className="h-0.5 w-4 rounded bg-emerald-500" />
            <span className="text-neutral-400">High</span>
          </div>
          <div className="flex items-center gap-1.5 py-0.5">
            <div className="h-0.5 w-4 rounded bg-yellow-500" />
            <span className="text-neutral-400">Medium</span>
          </div>
          <div className="flex items-center gap-1.5 py-0.5">
            <div className="h-0.5 w-4 rounded bg-red-500" />
            <span className="text-neutral-400">Low</span>
          </div>
        </div>
      </div>

      {/* Results overview — top-right (Neo4j-style: nodes/relationships by type) */}
      <div className="absolute right-3 top-12 z-10 max-h-[min(70vh,420px)] overflow-y-auto rounded-lg border border-white/10 bg-neutral-950/95 px-3 py-2.5 text-[10px] backdrop-blur-sm sm:text-xs">
        <p className="mb-2 font-semibold text-neutral-200">Results overview</p>
        {targetNode && (
          <p className="mb-2 truncate font-medium text-orange-400" title={targetNode.label}>
            {targetNode.label}
          </p>
        )}
        <p className="mb-1 font-medium text-neutral-300">
          Nodes ({Object.values(overview.nodeCountByType).reduce((a, b) => a + b, 0)})
        </p>
        <ul className="mb-3 list-none space-y-0.5 pl-0">
          {Object.entries(overview.nodeCountByType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <li key={type} className="flex items-center gap-2 text-neutral-400">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ENTITY_COLORS[type] ?? "#64748b" }}
                />
                <span className="capitalize">{ENTITY_LABELS[type] ?? type.replace(/_/g, " ")}</span>
                <span className="text-neutral-500">({count})</span>
              </li>
            ))}
        </ul>
        <p className="mb-1 font-medium text-neutral-300">
          Relationships ({visibleEdges.length})
        </p>
        <ul className="list-none space-y-0.5 pl-0">
          {Object.entries(overview.relCountByLabel)
            .sort(([, a], [, b]) => b - a)
            .map(([label, count]) => (
              <li key={label} className="text-neutral-400">
                <span className="capitalize">{label}</span>{" "}
                <span className="text-neutral-500">({count})</span>
              </li>
            ))}
        </ul>
      </div>

      {/* ReactFlow canvas */}
      <div className="h-full w-full pt-9">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.1}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1a1a1a" gap={20} size={1} />
          <Controls showInteractive={false} className="!bottom-3 !left-3" />
          <MiniMap
            nodeColor={(n) => {
              if (n.data?.isTarget) return "#ef4444";
              return (n.data?.color as string) || "#64748b";
            }}
            nodeStrokeWidth={0}
            nodeBorderRadius={50}
            maskColor="rgba(10,10,10,0.7)"
            className="hidden !rounded-lg !border !border-white/10 sm:block"
            style={{ backgroundColor: "#141414" }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
