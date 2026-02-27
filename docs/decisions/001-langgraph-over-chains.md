# ADR 001: LangGraph over LangChain linear chains

## Status

Accepted.

## Context

The investigation flow is inherently cyclic: the Research Director plans → workers execute (search, extract, analyze) → results flow back → Director re-plans. Linear chains cannot express "loop until termination condition" without ad-hoc code. We need conditional branching (e.g. route to risk_analysis vs. web_research) and cycles.

## Decision

Use **LangGraph** (StateGraph) as the orchestration layer instead of a linear LangChain chain.

- **Entry point**: Director node.
- **Conditional edges**: Director’s `next_action` drives routing to web_research, risk_analysis, connection_mapping, source_verification, or generate_report.
- **Cycles**: After web_research → fact_extraction, we return to the Director; same for analysis nodes. The graph runs until the Director chooses GENERATE_REPORT or TERMINATE.
- **State**: A single state dict (serialized from `ResearchState`) is passed between nodes; each node deserializes, runs the agent, and returns the updated state dict.

## Consequences

- **Pros**: Clear topology, native cycles and conditionals, good fit for LangSmith tracing and debugging.
- **Cons**: State is fully serialized/deserialized at each node boundary; for very large state we could later move to delta updates and reducers if needed.
