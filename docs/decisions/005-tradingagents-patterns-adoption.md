# ADR-005: Patterns Worth Adopting from TradingAgents

**Status**: Proposed  
**Date**: 2026-02-25  
**Context**: Staff-engineer comparison of TradingAgents architecture vs our Deep Research Agent

---

## Executive Summary

After reviewing the TradingAgents codebase (`/Users/harshsolanki/Developer/TradingAgents`),
I identified **5 patterns** worth adopting and **4 areas** where our current approach is already
superior. The recommendations are ranked by impact on the PRD evaluation criteria.

---

## Patterns Worth Adopting (Ranked by PRD Impact)

### 1. Adversarial Debate for Risk Analysis — HIGH IMPACT

**What TradingAgents does:**
Bull Researcher and Bear Researcher argue opposing positions, then a Research Manager
(judge) synthesizes the final decision. Risk management uses a 3-way debate (Aggressive /
Neutral / Conservative) before a Risk Manager decides.

Files: `tradingagents/agents/researchers/bull_researcher.py`,
`tradingagents/agents/researchers/bear_researcher.py`,
`tradingagents/agents/managers/research_manager.py`

**What we do now:**
Single-pass risk analysis — one agent produces risk flags in one LLM call.

**Why adopt:**
- The PRD explicitly evaluates "Quality of risk assessment insights" (30% weight under
  Research Capability) and "Ability to uncover non-obvious connections"
- A single-pass risk analysis is vulnerable to blind spots. An adversarial pattern where
  one agent argues *for* risks and another argues *against* forces more thorough analysis
- During the live demo, explaining "we use adversarial debate to reduce false positives
  and catch missed risks" is a strong staff-engineer signal

**Decision:** Adopt. Add a debate round before final risk assessment. One agent argues
threats are real and critical; another argues they're benign or false positives. The
existing risk analyzer acts as judge, producing higher-confidence flags.

**Trade-off:** +1 extra LLM call per risk analysis cycle (~$0.02-0.05). Worth it for
quality improvement that's visible in the demo.

---

### 2. Two-Tier Model Cost Strategy — HIGH IMPACT

**What TradingAgents does:**
Two explicit model tiers in config:
```python
"deep_think_llm": "o4-mini"       # For judges/managers (complex reasoning)
"quick_think_llm": "gpt-4o-mini"  # For analysts (routine extraction)
```

Managers and judges use the expensive model; analysts use the cheap one.

**What we do now:**
Each agent hardcodes a single provider (e.g., `self.provider = ModelProvider.CLAUDE`),
and the LLM client resolves to one model per provider. No concept of "use the cheaper
model when the task doesn't need deep reasoning."

**Why adopt:**
- PRD evaluates "Innovation & Efficiency" (20% weight) including "Optimization of
  search strategies" and "cost optimization"
- The PRD asks "What's your cost per investigation and how would you optimize it?"
- Using Opus 4 for the director's strategic planning but Gemini 2.5 Flash or GPT-4.1-mini
  for routine extraction cuts cost ~60% on those calls without quality loss
- Demonstrates cost-aware engineering during the live demo

**Decision:** Adopt. Add a `ModelTier` concept (DEEP / FAST) to config, and let agents
declare which tier they need rather than a specific provider.

**Trade-off:** Adds config complexity (2 more env vars). Saves significant cost on
high-iteration investigations.

---

### 3. Live Progress Display During Investigation — MEDIUM IMPACT

**What TradingAgents does:**
Rich TUI with live layout updates showing:
- Agent status (pending/in_progress/completed/error) per node
- Real-time message/tool call log
- Current report sections as they're generated
- Statistics footer

File: `cli/main.py` (1,110 lines using Typer + Rich Live layouts)

**What we do now:**
Basic structlog output during investigation, Rich panels only at start and end.
During execution, the user sees raw log lines — not great for a live demo.

**Why adopt:**
- PRD Phase 2 requires "Real-time execution on provided test case" — the demo is
  where this matters most
- The evaluators will watch the agent run live. Seeing structured progress
  (which agent is active, what it found, how many entities so far) is far more
  impressive than scrolling log lines
- Communication & Presentation is 15% of the evaluation

**Decision:** Adopt. Add a `--live` flag to the CLI that shows a Rich Live layout
with agent status, entity count, and current phase. Keep the existing output as
default for non-interactive/CI use.

**Trade-off:** ~150 lines of CLI code. High visual impact for the demo.

---

### 4. Full State Persistence Per Run — MEDIUM IMPACT

**What TradingAgents does:**
After each run, dumps the full agent state to JSON:
`eval_results/{ticker}/TradingAgentsStrategy_logs/full_states_log_{date}.json`

This enables debugging, comparison across runs, and evaluation.

**What we do now:**
We save `_state.json` and `_report.md` to `outputs/`, but only at the end.
No intermediate state snapshots.

**Why adopt:**
- PRD requires "Execution logs demonstrating agent performance" and "LangSmith
  walkthrough: show traces, demonstrate debugging a failure case"
- Full state dumps at each iteration enable post-mortem debugging without LangSmith
- Useful if LangSmith API key isn't available during the demo

**Decision:** Adopt partially. Save per-iteration state snapshots to
`outputs/{subject}/iteration_{N}.json` when `--debug` flag is passed.
Don't save by default (file I/O overhead).

**Trade-off:** Disk usage (~50KB per iteration × 8 iterations = 400KB). Negligible.

---

### 5. Vendor Abstraction Layer for Data Sources — LOW IMPACT

**What TradingAgents does:**
Clean vendor routing in `dataflows/interface.py`:
- Tools declare a category ("news_data", "stock_data")
- Config maps categories to vendors ("news_data" → "alpha_vantage")
- Fallback chain if primary vendor fails
- Tool-level overrides possible

**What we do now:**
Search orchestrator hardcodes Tavily → Brave fallback. Adding a third search
provider means editing `SearchOrchestrator.search()`.

**Why adopt:**
- PRD asks "How would you add a new data source (e.g., court records API)?"
- A plugin-style data source registry makes the answer convincing
- However, for a 4-day sprint, over-engineering the abstraction isn't worth it

**Decision:** Skip for now. The current Tavily→Brave orchestrator with the
`SearchOrchestrator` abstraction is sufficient. Mention the extensibility
path in the demo Q&A. If there's time after core features work, add a
registry pattern.

**Trade-off:** Not worth the implementation time for 4-day sprint.

---

## Areas Where Our Approach Is Already Superior

### 1. Error Handling — We're significantly ahead

TradingAgents has no retry logic, no error classification, no budget enforcement.
Our error taxonomy (`TransientError` / `PermanentError` / `BudgetExhaustedError`),
search auth detection, and persistent failure abort are production-grade.

### 2. Testing — We're significantly ahead

TradingAgents has 1 test file with 12 lines. We have 34 tests across 5 files covering
models, LLM client, search, graph routing, and agent behavior. The PRD explicitly
evaluates "test quality."

### 3. Security — We're ahead

TradingAgents has no input validation on Cypher queries (they don't use Neo4j).
Our Neo4j client uses allowlisted labels and relationship types to prevent injection.

### 4. Configuration — We're ahead

TradingAgents uses a plain Python dict with hardcoded paths and no validation.
Our Pydantic Settings with env var loading, type validation, and `.env` support
is the production pattern.

### 5. Documentation — We're ahead

TradingAgents has a README but no ADRs, no architecture rationale docs. Our 4 ADRs,
Mermaid diagram, and inline design comments show engineering judgment.

### 6. Prompt Engineering — We're ahead

TradingAgents uses inconsistent prompt patterns (some ChatPromptTemplate, some
f-strings). Our prompts consistently use XML-tagged context injection following
Anthropic's documented best practices, which the PRD explicitly references.

---

## Implementation Priority (for remaining sprint time)

| Pattern | Impact | Effort | Implement? |
|---------|--------|--------|------------|
| Adversarial debate for risk | HIGH | ~2h | YES |
| Two-tier model strategy | HIGH | ~1h | YES |
| Live progress CLI | MEDIUM | ~2h | YES |
| State persistence per iteration | MEDIUM | ~30min | YES |
| Vendor abstraction | LOW | ~3h | NO |

---

## Alignment with PRD Evaluation Criteria

- **Technical Excellence (35%)**: Two-tier models show cost awareness; debate shows
  architectural sophistication
- **Research Capability (30%)**: Adversarial debate directly improves risk assessment
  quality and connection discovery
- **Innovation & Efficiency (20%)**: Two-tier models + live progress are differentiators
- **Communication & Presentation (15%)**: Live progress display makes the demo compelling
