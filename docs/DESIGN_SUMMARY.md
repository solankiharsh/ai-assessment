# Design Summary — Deep Research AI Agent

One-page overview for live demo and reviewer walkthrough. Links point to ADRs in `docs/decisions/` and key source files.

---

## Consecutive search strategy

The agent runs in **phases**: Baseline → Breadth → Depth → Adversarial → Triangulation → Synthesis. The Research Director chooses the next phase and 2–5 search queries per step, so each iteration builds on prior findings (entities, hypotheses, gaps). No single “one-shot” search; the graph loops until the Director chooses `generate_report` or hits budget/termination. See [ADR 001 — LangGraph over chains](decisions/001-langgraph-over-chains.md) and `src/graph.py` for the state machine; phase prompts in `src/prompts/templates.py`.

---

## Dynamic query refinement

Search queries are **not** fixed. The Director receives current state (subject summary, known associations, entities, connections, risk flags, recent search history) and emits new queries that target gaps, contradictions, or deeper angles (e.g. “SEC enforcement Sisu Capital”, “Hans Overturf settlement”). Query refinement is implicit in the Director’s planning prompt and the loop back from workers (web research → fact extraction) to the Director. See `src/agents/director.py` and the Director system template in `src/prompts/templates.py`.

---

## Multi-model integration

At least two distinct models are used: **Claude Opus 4** for Director, risk judge, connections, and report (DEEP tier); **GPT-4.1** or a configured fast model for fact extraction and risk debate agents (FAST tier). A two-tier cost strategy keeps expensive calls for planning and synthesis and cheaper calls for high-volume extraction. See [ADR 002 — Multi-model strategy](decisions/002-multi-model-strategy.md) and `src/llm_client.py` (tier selection, budget).

---

## Risk debate and pattern recognition

Risk is not a single classifier. A **Risk Proponent** and **Risk Skeptic** argue from the same evidence; the **Risk Analyzer** (judge) produces risk flags with category and severity. This adversarial setup improves flag quality and reduces false positives. Flags are stored in state and reflected in the report and UI risk score. See `src/agents/risk_analyzer.py` and risk prompts in `src/prompts/templates.py`; Neo4j and allowlisted labels in [ADR 003](decisions/003-neo4j-graph-database.md).

---

## Evaluation (personas + depth-weighted scoring)

Three test personas (easy, medium, hard) provide ground-truth expected facts, entities, connections, and risk patterns. **Depth-weighted recall** scores facts by depth 1–5 (surface → deeply hidden); the aggregate `weighted_score` and `depth_breakdown` (e.g. `depth_4_recall`) measure how well the agent finds non-obvious facts. The hard persona (Timothy Overturf / Sisu Capital) includes SEC, DFPI, and fiduciary-breach–style expectations. See `src/evaluation/eval_set.py`, `src/evaluation/metrics.py`, and `make evaluate` / `python -m src.main evaluate --persona hard`.

---

## Scalability (budget and diminishing returns)

Each run has a **cost budget** (default $5); when the budget is exhausted, the pipeline stops and generates the report from current state. **Diminishing returns** logic can terminate early when the last N iterations add few new entities. This keeps demos and production runs bounded and avoids runaway API cost. See `src/llm_client.py` (budget tracking), `src/graph.py` (termination conditions), and config in `src/config.py` (`COST_BUDGET_USD`, iteration limits).
