# ADR 007: Evaluation — LangChain Deep Agents SDK vs current architecture

## Status

Rejected (for now). We keep the current LangGraph + specialist-nodes design.

## Context

The team asked whether [LangChain Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview) would help this project. Deep Agents is an "agent harness" on top of LangChain/LangGraph offering:

- **Task planning** via built-in `write_todos`
- **Context management** via file-system tools (`ls`, `read_file`, `write_file`, `edit_file`) and pluggable backends (in-memory, disk, LangGraph store, sandboxes)
- **Subagent spawning** via a `task` tool for context isolation
- **Long-term memory** via LangGraph Memory Store
- **Single entry point**: `create_deep_agent(tools=[...], system_prompt=...)` with a standard tool-calling loop

Our current system is a **supervisor-style LangGraph** with:

- **Research Director** that calls `plan_next_step(state)` and returns a decision (e.g. `web_research`, `fact_extraction`, `risk_analysis`, `generate_report`, `end`).
- **Fixed specialist nodes** (web_research, fact_extraction, risk_analysis, connection_mapping, source_verification, update_graph_db, generate_report) — each receives `ResearchState`, does one job, returns updated state.
- **No generic tool loop**: the director does not "call tools"; it chooses which node runs next. Tools (SearchOrchestrator, TieredFetcher, Tavily, etc.) are encapsulated inside those nodes.
- **Structured state**: `ResearchState` (Pydantic) with subject, entities, connections, risk_flags, search_records, etc., serialized to `dict` at graph boundaries.

## Pros of adopting Deep Agents

| Benefit | Notes |
|--------|--------|
| **Built-in task decomposition** | `write_todos` could theoretically replace or augment the director’s “next action” with an explicit todo list. |
| **Context offload** | File-system tools could help if we hit context limits (e.g. dumping large search result sets to a virtual FS and having the agent read chunks). |
| **Subagent isolation** | The `task` tool could spawn a subagent for a focused subtask (e.g. “extract entities from this one URL”) and keep the main agent’s context smaller. |
| **Pluggable backends** | In-memory vs disk vs LangGraph store could be useful for different deployment modes (e.g. serverless vs long-running). |
| **Ecosystem alignment** | Same vendor as LangChain/LangGraph; likely good integration and docs. |
| **Less custom orchestration** | In theory, one deep agent with many tools could replace the explicit graph and routing logic. |

## Cons of adopting Deep Agents

| Drawback | Notes |
|----------|--------|
| **Architectural mismatch** | Our flow is **supervisor + specialists**, not **one agent with a tool loop**. The director does not “use tools”; it selects the next **node**. Deep Agents is built for a single (or few) agents that call tools and optionally spawn subagents. Fitting our graph into that model would require a large redesign. |
| **State model** | We rely on a single, typed `ResearchState` that flows through the graph. Deep Agents is message- and tool-centric, with context in a virtual filesystem. Migrating would mean either (a) mapping our state into/out of the agent’s context (files + messages) at every step, or (b) giving the agent tools that directly mutate our state — both add complexity and failure modes. |
| **Domain-specific pipeline** | Our pipeline is **due-diligence specific**: search → extract facts → analyze risks → map connections → verify sources → report → Neo4j. Each step has custom logic (e.g. tiered fetch, SEC User-Agent, Pydantic extraction, risk severity). Deep Agents is generic; we’d still need to implement all of that inside tools or subagents, and we’d lose the clear, auditable graph structure we have today. |
| **Debugging and observability** | We have pipeline debug dumps (`step_001_director_in.json`, iteration snapshots, pipeline_debug_dir). A deep agent’s internal tool loop and filesystem state are harder to inspect and replay in the same way. |
| **New dependency and API surface** | Adding `deepagents` means another moving part, more docs to follow, and dependency on their roadmap (e.g. backends, sandboxes). Our current stack (LangGraph + LangChain LLMs) is already sufficient for the graph and model calls. |
| **Overlap with existing design** | We already have “planning” (director) and “decomposition” (multiple nodes). Deep Agents’ value is strongest when you need **one** agent to plan and execute over **many** steps with tools and files; we already decomposed the workflow into dedicated nodes. |
| **Risk and compliance** | Due diligence requires traceability: which node ran, what state changed, what sources were used. A single deep agent with a big tool set is harder to reason about for “what exactly did the system do in step N?” than our explicit graph. |

## Pros of keeping the current design

| Benefit | Notes |
|--------|--------|
| **Clear control flow** | The graph is explicit: director → one of N nodes → back to director or END. Easy to explain, test, and debug. |
| **Typed state** | `ResearchState` is one source of truth; no need to sync with a separate filesystem or message history. |
| **Domain fit** | Each node does one job (search, extract, risk, connections, verify, report, Neo4j). Matches the problem domain and is easy to extend (e.g. add a node). |
| **Proven stack** | LangGraph + LangChain LLMs already power the pipeline; no need to introduce a new harness. |
| **Traceability** | Pipeline debug files and iteration snapshots give a clear audit trail for investigations. |

## Cons of keeping the current design

| Drawback | Notes |
|----------|--------|
| **Context growth** | If `ResearchState` or search payloads grow very large, we might need to offload context (e.g. summarization, chunking, or external store). We can add that inside existing nodes or via a small “context manager” node without adopting Deep Agents. |
| **No built-in “todo list”** | The director’s plan is a single next action, not an explicit list of todos. If we want that, we can add a `planned_todos` (or similar) field to state and have the director emit/update it without changing framework. |

## Decision

**Do not adopt the Deep Agents SDK for this project.**

- Our architecture is **supervisor + specialist nodes**, not a single agent with a tool loop. Deep Agents is optimized for the latter.
- Our needs (tiered fetch, SEC compliance, fact extraction, risk analysis, report, Neo4j) are already well served by the current graph and agents.
- Introducing Deep Agents would require a major redesign (state model, control flow, observability) for limited benefit and added dependency surface.
- If we later need better context handling (e.g. offloading large content), we can add a dedicated mechanism (e.g. a context/node that writes/reads chunks) or a minimal internal “filesystem” without adopting the full Deep Agents harness.

## When to reconsider

- We decide to **replace** the director + nodes with **one** agent that chooses and runs tools (e.g. search, extract, risk, report) in a single loop.
- We need **subagent spawning** with strong isolation and are willing to refactor state and control flow to fit the Deep Agents model.
- LangChain adds **deep-agent-style context backends** (e.g. file offload) as standalone components we can plug into our existing graph without adopting the full SDK.

## References

- [Deep Agents overview](https://docs.langchain.com/oss/python/deepagents/overview)
- Current orchestration: `src/graph.py` (ResearchGraph, StateGraph, director + specialist nodes)
- State model: `src/models.py` (ResearchState, SubjectProfile, Entity, Connection, RiskFlag, etc.)
