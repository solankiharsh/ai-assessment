# ADR 005: Patterns evaluated and selectively adopted for risk analysis

**Status**: Accepted  
**Date**: 2026-02-25  
**Context**: We evaluated patterns from external agent architectures and adopted those that improved our evaluation criteria. Adversarial debate and a two-tier (DEEP/FAST) model strategy are documented here; one reference was the TradingAgents codebase.

---

## Executive summary

We studied several open-source agent architectures, identified proven patterns, and adopted what improved our evaluation criteria. We adopted adversarial debate (Proponent/Skeptic/Judge) and cost-tier routing (DEEP vs FAST). TradingAgents was one reference among others.

---

## 1. Adversarial debate for risk analysis — HIGH IMPACT

**Pattern:** Proponent/Skeptic/Judge — two agents argue opposing positions, a third synthesizes. (We evaluated TradingAgents’ Bull/Bear + Research Manager and similar 3-way risk debate; we adopted the structure.)

**Before:** Single-pass risk analysis — one agent, one LLM call.

**Rationale:** PRD weights "Quality of risk assessment insights" (30%) and "Ability to uncover non-obvious connections." Single-pass is vulnerable to blind spots; adversarial debate forces thorough coverage. Demo differentiator: "adversarial debate to reduce false positives and catch missed risks."

**Decision:** Adopt. Add a debate round before final risk assessment: one agent argues threats are real/critical, another argues benign/false positives; existing risk analyzer is judge. Higher-confidence flags.

**Trade-off:** +1 LLM call per cycle (~$0.02–0.05). Worth it for quality visible in the demo.

---

## 2. Two-tier model cost strategy — HIGH IMPACT

**Pattern:** DEEP vs FAST — route by task complexity (judges/managers on higher-cost model, routine extraction on cheaper). We adopted tier-based config, not per-agent hardcoding.

**Before:** Each agent hardcoded one provider; one model per provider. No "cheaper when task is routine" concept.

**Rationale:** PRD weights "Innovation & Efficiency" (20%), cost optimization, "cost per investigation." Director on stronger model, routine on cheaper cuts cost ~60% on those calls. Shows cost-aware engineering.

**Decision:** Adopt. Add `ModelTier` (DEEP / FAST) in config; agents declare tier by task.

**Trade-off:** Two more env vars. Saves significant cost on high-iteration runs.

---

## 3. Live progress display — MEDIUM IMPACT

**Pattern:** Rich live TUI — agent status per node, real-time log, report sections as generated, stats. We adopted a focused subset for our CLI.

**Before:** Structlog during run, Rich only at start/end. User sees raw log lines.

**Rationale:** PRD Phase 2: "Real-time execution"; Communication & Presentation 15%. Structured progress beats raw logs for demo.

**Decision:** Adopt. `--live` flag with Rich Live layout (agent status, entity count, phase). Default stays for non-interactive/CI.

**Trade-off:** ~150 lines. High visual impact.

---

## 4. Full state persistence per run — MEDIUM IMPACT

**Pattern:** Full state dump per run for debugging/comparison. We adopted per-iteration snapshots under a flag.

**Before:** `_state.json` and `_report.md` only at end. No intermediate snapshots.

**Rationale:** PRD requires execution logs and debugging; per-iteration state supports post-mortem without LangSmith.

**Decision:** Adopt partially. Per-iteration snapshots to `outputs/{subject}/iteration_{N}.json` when `--debug`. Off by default.

**Trade-off:** ~50KB × 8 iterations. Negligible.

---

## 5. Vendor abstraction for data sources — LOW IMPACT

**Pattern:** Category-based vendor routing, config mapping, fallback chain. We evaluated; for this sprint the gain didn’t justify the build.

**Before:** Tavily → Brave in orchestrator; third provider = edit `SearchOrchestrator.search()`.

**Rationale:** PRD asks how we’d add a source; registry would make that explicit. For 4-day sprint, current abstraction sufficient; describe extensibility in Q&A.

**Decision:** Skip. Keep Tavily→Brave; mention extensibility in demo Q&A.

**Trade-off:** Not worth implementation time this sprint.

---

## Where our approach is already stronger

1. **Error handling** — Retry, error taxonomy, budget enforcement, search auth detection, persistent failure abort.
2. **Testing** — 34 tests across 5 files (models, LLM client, search, graph, agents). PRD evaluates test quality.
3. **Security** — Allowlisted Neo4j labels/relationship types; no Cypher injection.
4. **Configuration** — Pydantic Settings, env vars, validation, `.env`.
5. **Documentation** — ADRs, Mermaid, inline design rationale.
6. **Prompt engineering** — Consistent XML-tagged context, Anthropic practices; PRD references this.

---

## Implementation priority

| Pattern | Impact | Effort | Do? |
|---------|--------|--------|-----|
| Adversarial debate | HIGH | ~2h | YES |
| Two-tier model | HIGH | ~1h | YES |
| Live progress CLI | MEDIUM | ~2h | YES |
| State per iteration | MEDIUM | ~30min | YES |
| Vendor abstraction | LOW | ~3h | NO |

---

## PRD alignment

- **Technical (35%)**: Two-tier + debate show cost awareness and architecture.
- **Research (30%)**: Debate improves risk quality and connection discovery.
- **Innovation & efficiency (20%)**: Two-tier and live progress.
- **Communication (15%)**: Live progress for the demo.
