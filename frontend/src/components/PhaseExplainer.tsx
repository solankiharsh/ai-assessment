"use client";

import type { SearchPhase } from "@/lib/types";
import { cn } from "@/lib/utils";

const PHASES: {
  id: SearchPhase;
  label: string;
  description: string;
  directorAction: string;
  agents: string[];
  exampleQueries: string[];
  color: string;
}[] = [
  {
    id: "baseline",
    label: "Baseline",
    description:
      "Establish initial profile: biographical facts, public presence, and known affiliations.",
    directorAction:
      "Plans broad discovery queries to build a foundational profile of the subject.",
    agents: ["Research Director (Claude)", "Web Search", "Fact Extractor (GPT-4.1)"],
    exampleQueries: ['"[Subject] biography"', '"[Subject] career history"', '"[Subject] education"'],
    color: "#3b82f6",
  },
  {
    id: "breadth",
    label: "Breadth",
    description:
      "Expand the entity landscape: people, organizations, locations, and events linked to the subject.",
    directorAction:
      "Emits 2–5 search queries to discover entities and relationships at scale.",
    agents: ["Research Director", "Web Search", "Fact Extractor", "Connection Mapper (Claude)"],
    exampleQueries: ['"[Subject] board members"', '"[Subject] companies"', '"[Subject] investments"'],
    color: "#a855f7",
  },
  {
    id: "depth",
    label: "Depth",
    description:
      "Deep-dive into each entity: verify facts, resolve inconsistencies, and enrich attributes.",
    directorAction:
      "Targets specific entity IDs for deeper verification and attribute extraction.",
    agents: ["Research Director", "Fact Extractor", "Source Verifier (Claude)"],
    exampleQueries: ['"[Entity name] SEC filing"', '"[Entity] litigation"', '"[Entity] sanctions"'],
    color: "#06b6d4",
  },
  {
    id: "adversarial",
    label: "Adversarial",
    description:
      "Stress-test the narrative: search for negative signals, litigation, and reputational risks.",
    directorAction:
      "Formulates adversarial queries to uncover risks and contradicting evidence.",
    agents: ["Research Director", "Web Search", "Risk Analyzer (Claude, debate agents)"],
    exampleQueries: ['"[Subject] lawsuit"', '"[Subject] fraud"', '"[Subject] regulatory"'],
    color: "#ef4444",
  },
  {
    id: "triangulation",
    label: "Triangulation",
    description:
      "Cross-reference across sources and providers (Tavily + Brave) to confirm or contradict claims.",
    directorAction:
      "Runs same or related queries across multiple search providers and merges results.",
    agents: ["Research Director", "Web Search (dual provider)", "Source Verifier"],
    exampleQueries: ['"[Claim] verification"', '"[Fact] source"', "Cross-check key assertions"],
    color: "#f59e0b",
  },
  {
    id: "synthesis",
    label: "Synthesis",
    description:
      "Final risk assessment, connection mapping, and report generation.",
    directorAction:
      "Chooses GENERATE_REPORT or continues if gaps remain; triggers risk debate and report writer.",
    agents: ["Research Director", "Risk Analyzer (judge)", "Connection Mapper", "Report Generator (Claude)"],
    exampleQueries: ["N/A — synthesis only"],
    color: "#22c55e",
  },
];

export function PhaseExplainer({
  selectedPhase,
  onSelectPhase,
  phaseStats,
}: {
  selectedPhase: SearchPhase | null;
  onSelectPhase: (p: SearchPhase) => void;
  phaseStats?: Record<SearchPhase, number>;
}) {
  const current = selectedPhase
    ? PHASES.find((p) => p.id === selectedPhase)
    : PHASES[0];
  const display = current ?? PHASES[0];

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card p-3">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Investigation phases
        </h2>
        <p className="mb-3 text-[10px] text-muted-foreground">
          LangGraph orchestration (ADR-001). Director drives phase transitions.
        </p>
        <nav className="flex flex-col gap-1">
          {PHASES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPhase(p.id)}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                (selectedPhase ?? "baseline") === p.id
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>{p.label}</span>
              {phaseStats && phaseStats[p.id] != null && (
                <span
                  className="font-mono text-[10px]"
                  style={{ color: p.color }}
                >
                  {phaseStats[p.id]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div
          className="mb-4 rounded-lg border p-4"
          style={{
            borderColor: display.color,
            backgroundColor: `${display.color}15`,
          }}
        >
          <h1 className="text-lg font-semibold" style={{ color: display.color }}>
            {display.label}
          </h1>
          <p className="mt-2 text-sm text-foreground">
            {display.description}
          </p>
        </div>
        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Director action
          </h3>
          <p className="text-sm text-foreground">
            {display.directorAction}
          </p>
        </section>
        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Agents involved (ADR-002 multi-model)
          </h3>
          <ul className="list-inside list-disc text-sm text-foreground">
            {display.agents.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Example queries
          </h3>
          <ul className="list-inside list-disc text-sm text-foreground">
            {display.exampleQueries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Flow (Director → Workers)
          </h3>
          <pre className="font-mono text-xs text-foreground">
            {`Director (plan) → search_web | extract_facts | analyze_risks | map_connections | verify_sources
         → state update → Director (next action or generate_report)`}
          </pre>
        </section>
      </div>
    </div>
  );
}
