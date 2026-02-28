# Neo4j in the pipeline and Timeline availability

## How Neo4j is used (beyond storage)

Neo4j is used in two ways:

### 1. Persistence (storage)

After the Director decides to **generate_report**, the graph runs:

1. **entity_resolution** → **temporal_analysis** → **generate_report** → **update_graph_db**

In **update_graph_db** we:

- Clear the Neo4j graph for this investigation (optional, configurable).
- **Persist** the current state: entities as nodes (with labels Person, Organization, etc.), connections as relationships (WORKS_AT, BOARD_MEMBER_OF, etc.), and risk flags as `RiskFlag` nodes and `FLAGGED_FOR` edges.

So the graph is the **source of truth** for the identity network and can be queried later (see [NEO4J_QUERIES.md](NEO4J_QUERIES.md)).

### 2. Graph discovery (analytics that improve the pipeline)

Right after persisting, we run **graph discovery** against Neo4j and append results to `state.graph_insights`. Those insights are then used in the report and in the frontend **Graph** tab. So Neo4j is not only storage—it drives analytics that feed back into the product.

| Step | What it does | How it improves the pipeline |
|------|----------------|-------------------------------|
| **Degree centrality** | Finds the most-connected nodes (by relationship count). | Surfaces “hub” entities (e.g. key people or orgs) for the report and the “Most connected” section in the UI. |
| **Shortest path** | Finds shortest path(s) from the **subject** to each **risk-flagged entity** (up to 5 hops). | Explains *how* the subject is linked to risky entities (e.g. “Subject → Company A → Person B → Flagged org”), improving narrative and risk explanation. |
| **Shell-company detection** | Finds organizations sharing the same address or registered agent. | Flags potential shell structures for the report and risk assessment. |

All of this is done in **update_graph_db** after `neo4j.persist_state(state)`. If any step fails (e.g. shortest path when start/end are the same or there is no path), we log and continue; the rest of the run is not blocked.

---

## Why “Timeline analysis not available” appears

The **Timeline** tab shows `temporal_facts` and `temporal_contradictions` from the investigation state. That data is produced by the **temporal_analysis** node, which runs **only** when the Director has chosen to generate a report. The flow is:

```
director → "generate_report" → entity_resolution → temporal_analysis → generate_report → update_graph_db
```

So:

- **Timeline is available** when:
  - The run went through **temporal_analysis**, and
  - The temporal analyzer’s LLM returned at least one valid temporal fact (with date ranges, etc.).

- **“Timeline analysis not available”** appears when:
  1. **temporal_facts** is missing or empty in the state file (e.g. `{slug}_state.json`).

Common reasons:

- **Run never reached temporal_analysis**  
  The Director might have ended the run (e.g. “end”) or hit an error before **entity_resolution** → **temporal_analysis**.

- **Temporal analyzer returned no facts**  
  The LLM might find no date-extractable claims in the current evidence, or return invalid/empty JSON; the node then leaves `temporal_facts` (and contradictions) empty.

- **Old or partial state**  
  The state file might be from a run that didn’t include the temporal step, or from a version of the graph that didn’t have this node.

To confirm:

- Inspect `outputs/{slug}_state.json`: look for `"temporal_facts": [...]`. If it’s `[]` or missing, the Timeline tab will show “Timeline analysis not available”.
- Re-run the investigation so that the Director goes to **generate_report** and the temporal_analysis node runs; then check the new state file and the Timeline tab again.
