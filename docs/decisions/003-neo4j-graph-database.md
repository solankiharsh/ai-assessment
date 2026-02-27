# ADR 003: Neo4j for identity graph persistence

## Status

Accepted.

## Context

Investigation output is a graph: people, organizations, events, and risk flags as nodes; relationships (WORKS_AT, INVESTED_IN, FLAGGED_FOR, etc.) as edges. We need to support queries like "entities within 2 hops of any HIGH-severity risk."

## Decision

Use **Neo4j** as the graph store instead of in-memory (e.g. NetworkX) or a relational DB.

- **Schema**: Node labels = Person, Organization, Location, Event, Document, FinancialInstrument, RiskFlag. Relationship types from our enum (WORKS_AT, BOARD_MEMBER_OF, etc.). Labels and relationship types are **allowlisted** in code to prevent Cypher injection (Cypher does not support parameterized labels).
- **Persistence**: After report generation, we run `persist_state(state)` to MERGE nodes and relationships. Each run can clear the graph first for a fresh identity graph per investigation.
- **Optional**: Controlled by `enable_graph_db`; if Neo4j is unavailable we log and continue without failing the run.

### Confidence scoring

Entity and connection models carry a **confidence** value (0–1) from fact extraction and the connection mapper. We persist it on nodes and edges so that:
- **Display**: The UI can show confidence as a badge or edge label (e.g. "80%" or high/medium/low). The graph view uses confidence for filtering (slider) and edge styling (dashed when &lt; 0.5).
- **Storage**: In Neo4j, confidence can be stored as a relationship property (e.g. `confidence: 0.8`) for future Cypher queries (e.g. "relationships with confidence &gt; 0.7").
- **Interpretation**: High (e.g. ≥ 0.7) = multiple sources or strong evidence; medium (0.4–0.7) = single source or inferred; low (&lt; 0.4) = speculative. This aligns with source verification and risk assessment (low-confidence links can be down-weighted in risk scoring).

## Consequences

- **Pros**: Native graph model, Cypher for path queries, good for demos and future "2-hop risk" style queries; industry standard for relationship-heavy data.
- **Cons**: Extra infra (we provide docker-compose); we avoid injection by validating all labels/rel types against allowlists.
