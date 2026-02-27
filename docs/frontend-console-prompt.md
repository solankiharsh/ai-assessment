# Frontend Console Prompt — Investigative Intelligence Platform

You are a senior UX architect and staff frontend engineer designing a high-stakes investigative intelligence platform.

Build a production-grade frontend for the **Deep Research Agent** backend used for due diligence and risk analysis. The backend is described in this repo’s [README](../README.md). This document defines the **actual** backend behavior, API contract for the web UI, data shapes, and UX requirements.

---

## Product context

- **Backend**: Deep Research Agent — LangGraph-orchestrated multi-model pipeline (Claude, GPT, Gemini). No HTTP API today; entry point is CLI: `python -m src.main investigate "Subject Name" --role X --org Y [--max-iter N] [--output DIR] [--debug] [--live]`.
- **Outputs**: File-based. For each run the backend writes to `output_dir` (default `outputs/`):
  - `{subject_slug}_report.md` — Final due diligence report (markdown).
  - `{subject_slug}_state.json` — Full investigation state (JSON serialization of `ResearchState`).
  - `{subject_slug}_entities.json` — Entity list (name, type, confidence, attributes, sources).
  - With `--debug`: `{subject_slug}/iteration_{N}.json` — Per-iteration state snapshots.
- **Identity graph**: Optional Neo4j persistence after report; graph can be derived from state `entities` + `connections` if Neo4j is not used.

The frontend must work against a **small API layer** that either (a) is added to this backend (e.g. FastAPI), or (b) is implemented in the frontend repo (e.g. Next.js API routes that shell out to the Python CLI and read/write the same `output_dir`). The contract below is the integration point.

---

## API contract (for the web UI)

Assume the following endpoints. The backend may implement them, or the frontend may implement them via BFF/API routes that call the CLI and read files.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/investigate` | Start an investigation. Body: `{ subject_name: string, current_role?: string, current_org?: string, max_iterations?: number }`. Returns `{ case_id: string, status: "running" }`. `case_id` is the subject slug (e.g. `timothy_overturf`). |
| GET | `/api/cases` | List cases. Scan `output_dir` for `*_state.json`. Return `{ cases: CaseSummary[] }` where each has `id`, `subject_name`, `updated_at`, `risk_score?`, `confidence?` (from state). |
| GET | `/api/cases/:id` | Full case. Read `{id}_state.json`, `{id}_report.md`, `{id}_entities.json`. Return unified JSON: `Investigation` (see types below). |
| GET or SSE | `/api/cases/:id/progress` or `/api/cases/:id/stream` | For a running investigation, stream progress: `{ phase, iteration, entity_count, connection_count, risk_count, last_node? }`. Backend runs the graph with an `on_progress` callback that pushes to a channel the frontend subscribes to. |
| GET | `/api/cases/:id/graph` | Optional. If Neo4j is used, return `{ nodes, edges }` for identity graph; else derive from state `entities` + `connections`. |

---

## Data types (TypeScript — match backend)

Backend state is defined in `src/models.py` (Pydantic). Use these shapes so the frontend matches the real API responses.

```ts
// Subject and enums (from backend)
type SearchPhase =
  | "baseline"
  | "breadth"
  | "depth"
  | "adversarial"
  | "triangulation"
  | "synthesis";

type EntityType =
  | "person"
  | "organization"
  | "location"
  | "event"
  | "document"
  | "financial_instrument";

type RelationshipType =
  | "WORKS_AT"
  | "BOARD_MEMBER_OF"
  | "FOUNDED"
  | "INVESTED_IN"
  | "SUBSIDIARY_OF"
  | "RELATED_TO"
  | "KNOWS"
  | "FAMILY_OF"
  | "SUED_BY"
  | "REGULATED_BY"
  | "MENTIONED_IN"
  | "PARTNER_OF"
  | "ADVISOR_TO"
  | "DONOR_TO"
  | "PREVIOUSLY_AT";

type RiskCategory =
  | "regulatory"
  | "litigation"
  | "financial"
  | "reputational"
  | "association"
  | "inconsistency"
  | "sanctions"
  | "political_exposure";

type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

interface SubjectProfile {
  full_name: string;
  aliases: string[];
  date_of_birth?: string | null;
  current_role?: string | null;
  current_organization?: string | null;
  education: Record<string, string>[];
  professional_history: Record<string, string>[];
  known_associations: string[];
  summary: string;
}

interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  aliases: string[];
  attributes: Record<string, unknown>;
  source_urls: string[];
  confidence: number;
  first_seen_iteration: number;
  description: string;
}

interface Connection {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: RelationshipType;
  description: string;
  attributes: Record<string, unknown>;
  source_urls: string[];
  confidence: number;
  start_date?: string | null;
  end_date?: string | null;
}

interface RiskFlag {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  description: string;
  evidence: string[];
  entity_ids: string[];
  confidence: number;
  mitigating_factors: string[];
}

interface Hypothesis {
  id: string;
  description: string;
  status: string;
  priority: number;
  related_entity_ids: string[];
  search_queries_tried: string[];
  evidence_for: string[];
  evidence_against: string[];
}

interface SearchRecord {
  query: string;
  provider: string;
  phase: SearchPhase;
  iteration: number;
  timestamp: string; // ISO
  num_results: number;
  result_urls: string[];
  raw_snippets: string[];
  was_useful: boolean;
}

interface Investigation {
  id: string; // case_id / subject_slug
  target: string; // subject.full_name
  status: "running" | "complete" | "failed";
  subject: SubjectProfile;
  entities: Entity[];
  connections: Connection[];
  risk_flags: RiskFlag[];
  search_history: SearchRecord[];
  hypotheses: Hypothesis[];
  current_phase: SearchPhase;
  iteration: number;
  max_iterations: number;
  confidence_scores: Record<string, number>;
  overall_confidence: number;
  total_llm_calls: number;
  total_search_calls: number;
  estimated_cost_usd: number;
  error_log: string[];
  final_report: string;
  // Optional: entities summary for list views
  entities_summary?: { name: string; type: EntityType; confidence: number }[];
}

interface CaseSummary {
  id: string;
  subject_name: string;
  updated_at: string; // ISO
  risk_score?: number; // derived from risk_flags
  confidence?: number;
  status?: "running" | "complete" | "failed";
}
```

---

## Tech stack

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind**
- **shadcn/ui** (heavily customized)
- **Framer Motion** (subtle motion only)
- **React Query** (TanStack Query)
- **Zustand** for local UI state
- **D3 or React Flow** for graph visualization
- No generic theme boilerplate

---

## Visual direction

- **Design language**: Dark-first (true dark, not gray Tailwind default). High-density information layout. Asymmetric multi-panel layout. Minimal color; strategic highlights (risk = amber/red). Monospace used selectively for logs and source references. Serious, intelligence-grade aesthetic.
- **Reference feel**: Palantir, Recorded Future, Maltego — not Notion, Linear, or “AI SaaS template.”
- **Avoid**: Rounded pastel cards everywhere, over-spaced UI, symmetric grid dashboards, giant hero sections.

---

## Core layout: 3-zone intelligence console

- **Left panel — Investigation Navigator**: Case selector, investigation history, status (Running / Paused / Complete / Failed), expandable investigation tree (entity expansion history). Collapsible.
- **Center panel — Intelligence Workspace**: Dynamic content by mode: Overview, Entity deep dive, Risk analysis, Graph exploration, Source trace.
- **Right panel — Contextual Insight**: Risk meter, confidence score, key findings summary, active hypotheses, source validation breakdown, timeline summary.

Panels must resize and collapse intelligently.

---

## Routes

- **`/cases`** — Case management. Create new investigation, search existing cases, sort by risk score / last updated, status badges, quick resume.
- **`/cases/[id]`** — Primary Investigation Console. Tabs (compact intelligence-style tab switcher, not top nav): Overview, Entities, Graph, Risk Analysis, Source Audit, Execution Trace. Each tab must feel purpose-built.

---

## Tab requirements

1. **Overview** — Executive summary, risk score (0–100), confidence score, key red flags, investigation depth metric, entity count, source count, timeline of discoveries. Include expandable “How this conclusion was reached.”
2. **Entities** — Hybrid explorer: left = entity list with filters (Person / Org / Event etc.); center = entity detail card; right = connections + risk flags. Entity card: metadata, confidence, source citations, connected entities preview, risk indicators, timeline placement. Support: pin entity, compare two entities side-by-side, filter by confidence threshold.
3. **Graph** — Interactive identity graph. Zoom, pan, node clustering, risk highlighting, filter by entity type, edge confidence threshold slider, click node → focus mode, expand from node. Styling: Persons = circles, Orgs = hexagons, Events = diamonds; risky nodes glow subtly.
4. **Risk Analysis** — Sections by category (e.g. Financial opacity, Regulatory exposure, Litigation, Political exposure, Inconsistency flags). Per section: severity indicator, supporting evidence, source links, confidence, related entities. “Explain this risk” expandable reasoning; evidence collapse/expand.
5. **Source Audit** — All sources used, domain authority score, agreement ratio, conflicting claims, citation graph, date distribution. Filter by domain, sort by confidence, highlight contradictions. Forensic feel.
6. **Execution Trace** — Agent reasoning progression (cleaned): search iterations, query refinements, hypothesis triggers, tool calls, model arbitration, retry events. Structure: Step → Action → Outcome → Confidence shift. Monospace view option; filter by model used.

---

## Components to build

- **RiskMeter** — 0–100 with severity bands
- **ConfidenceBadge**
- **EntityCard**
- **HypothesisPanel**
- **InvestigationTimeline**
- **SourceCredibilityBar**
- **ConflictIndicator**
- **ExpandableReasoningBlock**
- **GraphLegend**
- **CaseStatusIndicator**
- **InvestigationProgressBar**
- **FilterChipSystem**
- **CommandPalette** (Cmd+K)

---

## States (non-negotiable)

Every page must handle: **Loading** (skeletons), **Error** (with retry), **Empty**, **Partial data**, **Live updating** (polling or SSE for running case), **Optimistic UI** for case creation.

---

## Advanced interaction

- **Cmd+K** — Jump to entity
- **Focus Mode** — Hide side panels
- Keyboard navigation across entities
- Multi-select entities → bulk export
- Global confidence threshold slider
- Toggle to collapse low-confidence edges

---

## Micro details

- All timestamps: relative + absolute
- Copyable source links
- Export case report (button)
- Subtle animated graph transitions
- Smooth panel resizing
- Dark-mode persistent preference
- URL state sync (tab + selected entity)

---

## Data handling

- Use **React Query**: polling for running investigations, cache invalidation, error boundary.
- Assume API returns `Investigation` (and list `CaseSummary[]`) as in the types above. Backend state is in `state.json`; report text in `report.md`; entities list in `entities.json`. The API layer should unify these into `GET /api/cases/:id` as a single `Investigation` object.

---

## Hard bans

Do **not**:

- Use generic analytics cards or “Total Users / Revenue” placeholders
- Use evenly spaced dashboard grids
- Leave dead buttons
- Make the graph static
- Show lorem ipsum
- Overuse giant padding

---

## Deliverable

- Project folder structure
- Full layout implementation
- Core components
- Graph integration
- Mock API integration (or real integration if backend exposes the contract)
- State management
- Example data (from a real `*_state.json` / `*_report.md` if available)
- README explaining UX decisions

Make it runnable. If unsure: choose depth and density over simplicity.
