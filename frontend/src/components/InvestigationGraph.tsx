"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const ENTITY_COLORS: Record<EntityType, string> = {
  person: "#3b82f6",
  organization: "#a855f7",
  location: "#06b6d4",
  event: "#f59e0b",
  document: "#64748b",
  financial_instrument: "#22c55e",
};

function CustomNode({
  data,
  selected,
}: {
  data: {
    label?: string;
    type?: EntityType;
    confidence?: number;
    hasRisk?: boolean;
  };
  selected?: boolean;
}) {
  const type = data.type ?? "person";
  const color = ENTITY_COLORS[type] ?? ENTITY_COLORS.person;
  const hasRisk = data.hasRisk ?? (data.confidence ?? 1) < 0.5;
  const zoom = useViewport().zoom;
  const showLabel = zoom >= 0.8;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border-2 px-2 py-1 text-xs",
        "bg-[var(--bg-card)] text-[var(--foreground)]",
        selected && "ring-2 ring-[var(--accent)]",
        hasRisk && "animate-pulse-risk"
      )}
      style={{
        backgroundColor: `${color}22`,
        borderColor: color,
        boxShadow: hasRisk ? `0 0 12px ${color}66` : undefined,
        clipPath:
          type === "organization"
            ? "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
            : undefined,
        borderRadius:
          type === "person" ? "9999px" : type === "location" ? "4px" : "6px",
        minWidth: type === "organization" ? "64px" : "56px",
        minHeight: type === "organization" ? "56px" : "40px",
      }}
    >
      <div className="font-medium truncate max-w-[80px] text-center">
        {data.label ?? "?"}
      </div>
      {showLabel && (
        <div
          className="text-[10px] capitalize opacity-80"
          style={{ color }}
        >
          {type.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { custom: CustomNode };

/** Force-directed layout: repulsion between nodes + attraction along edges. */
function runForceLayout(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  width: number,
  height: number,
  iterations = 120
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  nodeIds.forEach((id) => {
    positions.set(id, {
      x: width * (0.1 + 0.8 * Math.random()),
      y: height * (0.1 + 0.8 * Math.random()),
    });
  });
  const repel = 8000;
  const attract = 0.04;
  const damp = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    nodeIds.forEach((id) => forces.set(id, { fx: 0, fy: 0 }));

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

    nodeIds.forEach((id) => {
      const pos = positions.get(id)!;
      const force = forces.get(id)!;
      pos.x = pos.x + force.fx * damp;
      pos.y = pos.y + force.fy * damp;
      pos.x = Math.max(0, Math.min(width, pos.x));
      pos.y = Math.max(0, Math.min(height, pos.y));
    });
  }

  return positions;
}

function toFlowNodes(
  nodes: { id: string; label: string; type: EntityType; data?: Record<string, unknown> }[],
  filterType: EntityType | null,
  riskEntityIds: Set<string>,
  visibleNodeIds: Set<string>,
  positions: Map<string, { x: number; y: number }>
): Node[] {
  const byType = filterType
    ? nodes.filter((n) => n.type === filterType)
    : nodes;
  const filtered = byType.filter((n) => visibleNodeIds.has(n.id));
  const span = Math.max(400, Math.sqrt(filtered.length) * 200);
  return filtered.map((n) => {
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
      },
    };
  });
}

function toFlowEdges(
  edges: { id: string; source: string; target: string; confidence?: number }[],
  nodeIds: Set<string>,
  confidenceThreshold: number
): Edge[] {
  return edges
    .filter(
      (e) =>
        nodeIds.has(e.source) &&
        nodeIds.has(e.target) &&
        (e.confidence ?? 1) >= confidenceThreshold
    )
    .map((e) => {
      const conf = e.confidence ?? 1;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep" as const,
        label: conf < 1 ? `${Math.round(conf * 100)}%` : undefined,
        labelStyle: { fontSize: 10, fill: "var(--muted)" },
        labelShowBg: true,
        labelBgStyle: { fill: "var(--panel)" },
        labelBgBorderRadius: 2,
        labelBgPadding: [2, 4] as [number, number],
        style: {
          stroke: "var(--muted)",
          strokeWidth: conf >= 0.7 ? 1.5 : 1,
          strokeDasharray: conf < 0.5 ? "5 5" : undefined,
        },
      };
    });
}

interface InvestigationGraphProps {
  caseId: string;
  onNodeSelect?: (entityId: string) => void;
  riskEntityIds?: Set<string>;
}

type GraphNode = { id: string; label: string; type: EntityType; data?: Record<string, unknown> };
type GraphEdge = { id: string; source: string; target: string; confidence?: number };

export function InvestigationGraph({
  caseId,
  onNodeSelect,
  riskEntityIds = new Set(),
}: InvestigationGraphProps) {
  const confidenceThreshold = useUIStore((s) => s.confidenceThreshold);
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["graph", caseId],
    queryFn: () => api.getGraph(caseId),
  });

  const rawNodes = data?.nodes ?? [];
  const rawEdges = data?.edges ?? [];

  const visibleNodeIds = useMemo(() => {
    if (!rawNodes.length) return new Set<string>();
    const typeFiltered = entityTypeFilter
      ? rawNodes.filter((n) => n.type === entityTypeFilter)
      : rawNodes;
    const typeIds = new Set(typeFiltered.map((n) => n.id));
    const nodeConf = (n: GraphNode) => (n.data as { confidence?: number })?.confidence ?? 1;
    const edgeConf = (e: GraphEdge) => e.confidence ?? 1;
    const passesByEntity = new Set(
      typeFiltered
        .filter((n) => typeIds.has(n.id) && nodeConf(n) >= confidenceThreshold)
        .map((n) => n.id)
    );
    const passesByEdge = new Set<string>();
    rawEdges.forEach((e) => {
      if (edgeConf(e) < confidenceThreshold) return;
      if (typeIds.has(e.source)) passesByEdge.add(e.source);
      if (typeIds.has(e.target)) passesByEdge.add(e.target);
    });
    const byConfidence = new Set<string>([...passesByEntity, ...passesByEdge]);

    if (focusedNodeId && typeIds.has(focusedNodeId)) {
      const oneHop = new Set<string>([focusedNodeId]);
      rawEdges.forEach((e) => {
        if (edgeConf(e) < confidenceThreshold) return;
        if (e.source === focusedNodeId && typeIds.has(e.target)) oneHop.add(e.target);
        if (e.target === focusedNodeId && typeIds.has(e.source)) oneHop.add(e.source);
      });
      return new Set([...oneHop].filter((id) => byConfidence.has(id)));
    }
    return byConfidence;
  }, [rawNodes, rawEdges, entityTypeFilter, confidenceThreshold, focusedNodeId]);

  const visibleEdges = useMemo(() => {
    return rawEdges.filter(
      (e) =>
        visibleNodeIds.has(e.source) &&
        visibleNodeIds.has(e.target) &&
        (e.confidence ?? 1) >= confidenceThreshold
    );
  }, [rawEdges, visibleNodeIds, confidenceThreshold]);

  const layoutSize = Math.max(600, Math.sqrt(visibleNodeIds.size) * 200);

  const positions = useMemo(() => {
    const ids = [...visibleNodeIds];
    if (ids.length === 0) return new Map<string, { x: number; y: number }>();
    return runForceLayout(
      ids,
      visibleEdges.map((e) => ({ source: e.source, target: e.target })),
      layoutSize,
      layoutSize
    );
  }, [visibleNodeIds, visibleEdges, layoutSize]);

  const initialNodes = useMemo(() => {
    if (!rawNodes.length) return [];
    return toFlowNodes(
      rawNodes,
      entityTypeFilter,
      riskEntityIds,
      visibleNodeIds,
      positions
    );
  }, [rawNodes, entityTypeFilter, riskEntityIds, visibleNodeIds, positions]);

  const initialEdges = useMemo(() => {
    return toFlowEdges(rawEdges, visibleNodeIds, confidenceThreshold);
  }, [rawEdges, visibleNodeIds, confidenceThreshold]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setFocusedNodeId(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  const showFullGraph = useCallback(() => setFocusedNodeId(null), []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        Loading graph…
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
        className="react-flow-dark"
      >
        <Background color="var(--muted)" gap={12} />
        <Controls className="!bottom-2 !left-2 !bg-[var(--bg-card)] !border-[var(--border)]" />
        <MiniMap
          className="!bg-[var(--bg-card)] !border-[var(--border)]"
          nodeColor={(n) =>
            ENTITY_COLORS[(n.data.type as EntityType) ?? "person"] ?? "#64748b"
          }
        />
        <Panel position="top-right" className="flex flex-col gap-2">
          {focusedNodeId && (
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
