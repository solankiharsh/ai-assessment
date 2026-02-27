"use client";

import { useMemo } from "react";
import type { LiveProgressEvent } from "@/components/tabs/TabEvidence";

// All graph nodes in execution order
const PIPELINE_NODES = [
    { key: "director", label: "Director" },
    { key: "web_research", label: "Web Research" },
    { key: "fact_extraction", label: "Facts" },
    { key: "risk_analysis", label: "Risk Analysis" },
    { key: "connection_mapping", label: "Connections" },
    { key: "source_verification", label: "Verification" },
    { key: "entity_resolution", label: "Entities" },
    { key: "temporal_analysis", label: "Temporal" },
    { key: "generate_report", label: "Report" },
    { key: "update_graph_db", label: "Graph DB" },
];

interface Props {
    currentNode: string;
}

export function PipelineProgress({ currentNode }: Props) {
    const currentIndex = useMemo(
        () => PIPELINE_NODES.findIndex((n) => n.key === currentNode),
        [currentNode]
    );

    return (
        <div className="overflow-x-auto -mx-1 px-1 py-2">
            <div className="flex items-center gap-0.5 min-w-max sm:gap-1">
                {PIPELINE_NODES.map((node, i) => {
                    const isActive = node.key === currentNode;
                    const isDone = currentIndex >= 0 && i < currentIndex;

                    return (
                        <div key={node.key} className="flex items-center">
                            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                                <div
                                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-300 sm:h-8 sm:w-8 sm:text-xs ${isActive
                                            ? "animate-pulse bg-orange-500 text-white ring-2 ring-orange-400 ring-offset-1 ring-offset-[#0a0a0a] sm:ring-offset-2"
                                            : isDone
                                                ? "bg-emerald-500/20 text-emerald-400"
                                                : "bg-white/5 text-neutral-600"
                                        }`}
                                >
                                    {isDone ? "✓" : i + 1}
                                </div>
                                <span
                                    className={`whitespace-nowrap text-[8px] sm:text-[10px] ${isActive
                                            ? "font-semibold text-orange-400"
                                            : isDone
                                                ? "text-emerald-400/60"
                                                : "text-neutral-600"
                                        }`}
                                >
                                    {node.label}
                                </span>
                            </div>
                            {i < PIPELINE_NODES.length - 1 && (
                                <div
                                    className={`mx-0.5 h-px w-3 sm:mx-1 sm:w-4 ${isDone ? "bg-emerald-500/40" : "bg-white/10"
                                        }`}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Derive currentNode from SSE events */
export function currentNodeFromEvents(events: LiveProgressEvent[]): string {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.event === "node_start" && e.node) return e.node;
    }
    return "";
}
