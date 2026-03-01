# Implementation Plan: Graph Persistence Before Report & Graph Reasoning

This document captures the implementation plan for moving graph persistence before report generation, adding a dedicated graph reasoning node, and enriching the Neo4j schema and frontend for graph-derived insights. The plan has been implemented in the codebase; this file serves as both specification and reference.

---

## 1. Move Graph Persistence BEFORE Report Generation

**Goal:** Run `update_graph_db` after temporal analysis and before report generation so that graph reasoning can inform the report and even support future “additional investigation” triggers.

### Flow change

- **Before:** `Director → generate_report → entity_resolution → temporal_analysis → generate_report → update_graph_db → END`
- **After:** `Director → generate_report → entity_resolution → temporal_analysis → update_graph_db → [graph_reasoning | generate_report] → generate_report → END`

### Implementation

- In `src/graph.py`:
  - `temporal_analysis` now edges to `update_graph_db` (no longer directly to `generate_report`).
  - After `update_graph_db`, a conditional edge routes to either `graph_reasoning` (when graph DB is enabled and populated) or `generate_report`.
  - `graph_reasoning` edges to `generate_report`.
  - `generate_report` edges to `END` (no longer to `update_graph_db`).
- The “complete” SSE event is emitted from `generate_report` (moved from `update_graph_db`).
- `_route_after_graph_db(state_dict)` returns `"graph_reasoning"` when `enable_graph_db` is true and `graph_db_populated` is true; otherwise `"generate_report"`.

---

## 2. Graph Reasoning Node

**Goal:** A dedicated node that runs discovery Cypher queries against the populated Neo4j graph and writes results into state for the report.

### Location

- `src/agents/graph_reasoner.py`

### Behavior

- After `update_graph_db`, when graph is enabled and populated, the graph reasoning node runs a fixed set of **discovery queries** against Neo4j.
- Results are appended to `state['graph_insights']` as structured entries (e.g. `GraphInsight`-style: `query_name`, `description`, `insight_type`, `results`, `result_count`).
- The node is skipped when `enable_graph_db` is false or `graph_db_populated` is false (e.g. Neo4j not connected or persist returned no data).

### Discovery queries (examples)

- **hidden_intermediaries** — Entities connected to the subject through 2+ independent paths.
- **shared_addresses** — Organizations sharing a location (shell company indicator).
- **risk_proximity** — Shortest path from subject to any HIGH/critical severity risk flag.
- **hub_entities** — Most connected entities (potential key facilitators).
- **temporal_overlap** — Organizations with overlapping active periods and shared personnel.
- **isolated_clusters** — Entities not connected to the main subject graph within a hop limit.

Cypher is parameterized (e.g. `$subject_name`, `$investigation_id`); labels and relationship types remain allowlisted in the client.

---

## 3. GraphInsight Model

**Location:** `src/models.py`

```python
class GraphInsight(BaseModel):
    query_name: str
    description: str
    insight_type: str  # hidden_connection, shell_company_indicator, risk_proximity, etc.
    results: list[dict[str, Any]]
    result_count: int
```

`ResearchState` already had `graph_insights: list[dict[str, Any]]`; a `graph_db_populated: bool` field was added so the router can decide whether to run graph reasoning after persist.

---

## 4. Enriched Neo4j Schema

**Goal:** Store enough metadata on nodes and relationships to support discovery queries and future “what changed” use cases.

### Node properties (examples)

- Entities: `entity_id`, `name`, `investigation_id`, `updated_at`, plus existing fields (e.g. `confidence`, `description`, `source_urls`). Optional: `location`, `founded_date`, `dissolved_date` from attributes when present.
- RiskFlag: `flag_id`, `severity`, `title`, `category`, `description`, `confidence`, `evidence`, `investigation_id`.

### Relationship properties

- `confidence`, `description`, `source_urls`, `start_date`, `end_date`, `investigation_id`, `updated_at` (and existing provenance fields where used).

### Implementation

- `src/graph_db/neo4j_client.py`:
  - `persist_state` sets `investigation_id` (derived from subject name) and `updated_at` on entities and relationships.
  - RiskFlag nodes are merged by `flag_id` and linked to entities via `(entity)-[:FLAGGED_FOR]->(rf)` or the existing direction used in the codebase; `investigation_id` is set on risk flag nodes.
  - No raw user input is used in Cypher; all labels and relationship types remain allowlisted.

---

## 5. RiskFlags as Nodes

Risk flags are persisted as nodes (label `RiskFlag`) with properties such as `flag_id`, `severity`, `title`, `category`, `description`, `confidence`, `investigation_id`. Entities are linked to risk flags (e.g. `FLAGGED_FOR` relationships) so that discovery queries like **risk_proximity** can use `shortestPath((subject)-[*..4]-(rf))` to find paths from the subject to high-severity risks.

---

## 6. Graph Insights in the Report

- In `src/agents/report_generator.py`, the report prompt is given a formatted **graph_insights** section (description + results per insight).
- In `src/prompts/templates.py`, `REPORT_GENERATOR_USER_TEMPLATE` includes a `<graph_insights>` placeholder and instructions to add a “Network Analysis” section when graph insights are present, highlighting structural patterns (e.g. hidden intermediaries, risk proximity, hub entities, shell company indicators) that no single source would reveal.

---

## 7. Frontend: `/api/cases/[id]/graph` with Optional Live Cypher

**Goal:** The Graph tab can continue to read from state JSON; optionally, the same route can run allowlisted Cypher against Neo4j when configured.

### Behavior

- **GET /api/cases/[id]/graph** (no query param): Returns graph data from the case state JSON (nodes and edges from `state.entities` and `state.connections`). No Neo4j required.
- **GET /api/cases/[id]/graph?query=<name>**: Runs an allowlisted read-only query against Neo4j and returns `{ query, results }`. Allowed names: `full_graph`, `risk_paths`, `hub_entities` (or as defined in the route). If Neo4j is not configured (missing `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`), the route returns 503. Invalid query name returns 400.

### Implementation

- `frontend/src/app/api/cases/[id]/graph/route.ts`:
  - Validates `id` and optional `query` param.
  - If `query` is present, checks it against `ALLOWED_QUERIES`; builds parameters (e.g. `subject_name`, `investigation_id`) from the case state file.
  - Uses the `neo4j-driver` package (optional dependency) to run the Cypher and return results. If the driver is not installed or Neo4j env vars are missing, the API returns an appropriate error (503/502).

To enable live Cypher from the frontend:

1. Install the driver: `npm install neo4j-driver` (or equivalent) in the frontend.
2. Set `NEO4J_URI`, `NEO4J_USERNAME`, and `NEO4J_PASSWORD` in the environment used by the Next.js server.

---

## 8. Indexes for Performance

In `src/graph_db/neo4j_client.py`, `ensure_indexes()` creates indexes (e.g. on `Person(name)`, `Organization(name)`, `Location(name)`, `RiskFlag(flag_id)`, `RiskFlag(severity)`, and `investigation_id` where applicable). It is called from `persist_state` so that the first persist after connection creates the indexes. Index creation is best-effort (failures are logged, not raised).

---

## 9. Incremental Re-Investigation Support (Foundation)

With `investigation_id` and `updated_at` on nodes and relationships, you can support “what changed since last run” by:

- Storing a `last_run_timestamp` (or equivalent) per investigation.
- Running read-only Cypher such as:
  - **new_entities_since_last_run**: nodes with `investigation_id = $id` and `updated_at > $last_run_timestamp`.
  - **new_connections_since_last_run**: relationships with the same filters.

This provides the foundation for features like “re-investigate Timothy Overturf — what’s changed since last month?” without re-running the full pipeline. The exact queries and API surface can be added in a follow-up.

---

## Summary of Files Touched

| Area | File(s) |
|------|--------|
| Flow & routing | `src/graph.py` |
| Graph reasoning | `src/agents/graph_reasoner.py` (new) |
| Models | `src/models.py` (GraphInsight, graph_db_populated) |
| Neo4j | `src/graph_db/neo4j_client.py` (execute_read, ensure_indexes, investigation_id, updated_at) |
| Report | `src/agents/report_generator.py`, `src/prompts/templates.py` |
| Frontend API | `frontend/src/app/api/cases/[id]/graph/route.ts` |
| Documentation | `docs/implementation-plan-graph-reasoning.md` (this file), `APPROACH.md` (updated to describe the new flow) |

---

## References

- ADR 003: Neo4j for identity graph persistence (`docs/decisions/003-neo4j-graph-database.md`)
- APPROACH.md: Design approach and architecture (includes graph flow and graph reasoning)
