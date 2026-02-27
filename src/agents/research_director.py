"""
Research Director Agent — the brain of the investigation.

Supervisor node in the LangGraph. Plans each step, generates search queries,
decides when to terminate. Includes diminishing-returns detection and
budget-exhausted handling.
"""

from __future__ import annotations

import json

import structlog

from src.config import get_settings
from src.llm_client import BudgetExhaustedError, LLMClient, ModelTask, ModelTier
from src.models import (
    AgentAction,
    DirectorDecision,
    ResearchState,
    SearchPhase,
)
from src.prompts.templates import (
    RESEARCH_DIRECTOR_SYSTEM,
    RESEARCH_DIRECTOR_USER_TEMPLATE,
)

logger = structlog.get_logger()


class ResearchDirector:
    """
    Orchestrating agent that plans each investigation step.
    Uses diminishing returns (last N iterations yield few new entities) to
    terminate early when appropriate. Detects persistent failures (all
    providers down) and aborts gracefully instead of spinning.
    """

    CONSECUTIVE_FAILURE_LIMIT = 3

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.DEEP
        self.task = ModelTask.RESEARCH_DIRECTOR
        self._consecutive_llm_failures: int = 0

    async def plan_next_step(self, state: ResearchState) -> DirectorDecision:
        """Analyze state and decide next action. Handles budget and diminishing returns."""
        settings = get_settings()

        if state.iteration >= state.max_iterations:
            logger.info("director_max_iterations_reached", iteration=state.iteration)
            return DirectorDecision(
                reasoning="Maximum iterations reached. Moving to synthesis.",
                next_action=AgentAction.GENERATE_REPORT,
                current_phase=SearchPhase.SYNTHESIS,
                confidence_in_completeness=state.overall_confidence,
            )

        if self._consecutive_llm_failures >= self.CONSECUTIVE_FAILURE_LIMIT:
            logger.error(
                "director_persistent_failures",
                consecutive=self._consecutive_llm_failures,
            )
            return DirectorDecision(
                reasoning=(
                    f"LLM provider failed {self._consecutive_llm_failures} consecutive "
                    f"times. Check API keys and provider status. "
                    f"Generating report with whatever findings exist."
                ),
                next_action=AgentAction.GENERATE_REPORT,
                current_phase=SearchPhase.SYNTHESIS,
                confidence_in_completeness=state.overall_confidence,
            )

        # Diminishing returns: last N iterations each yielded < min new entities
        lookback = settings.agent.diminishing_returns_lookback_iterations
        min_entities = settings.agent.diminishing_returns_min_entities
        if lookback > 0 and len(state.entities_added_per_iteration) >= lookback:
            recent = state.entities_added_per_iteration[-lookback:]
            if all(n < min_entities for n in recent):
                logger.info(
                    "director_diminishing_returns",
                    recent=recent,
                    lookback=lookback,
                )
                return DirectorDecision(
                    reasoning=("Diminishing returns: recent iterations yielded few new entities. Moving to synthesis."),
                    next_action=AgentAction.GENERATE_REPORT,
                    current_phase=SearchPhase.SYNTHESIS,
                    confidence_in_completeness=state.overall_confidence,
                )

        user_prompt = self._format_context(state)

        try:
            raw_response = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=RESEARCH_DIRECTOR_SYSTEM,
                user_prompt=user_prompt,
            )
            self._consecutive_llm_failures = 0
            state.total_llm_calls += 1
            decision = self._parse_decision(raw_response, state)
            logger.info(
                "director_decision",
                action=decision.next_action,
                phase=decision.current_phase,
                num_queries=len(decision.search_queries),
                confidence=decision.confidence_in_completeness,
                reasoning=decision.reasoning[:200],
            )
            return decision
        except BudgetExhaustedError as e:
            logger.warning("director_budget_exhausted", error=str(e))
            return DirectorDecision(
                reasoning=f"Cost budget exhausted: {e}. Generating report with current findings.",
                next_action=AgentAction.GENERATE_REPORT,
                current_phase=SearchPhase.SYNTHESIS,
                confidence_in_completeness=state.overall_confidence,
            )
        except Exception as e:
            self._consecutive_llm_failures += 1
            logger.error(
                "director_planning_error",
                error=str(e),
                consecutive_failures=self._consecutive_llm_failures,
            )
            return self._fallback_decision(state)

    def _format_context(self, state: ResearchState) -> str:
        """Format current state into the prompt template."""
        entities_summary = ""
        for e in state.entities[:30]:
            attrs = ", ".join(f"{k}: {v}" for k, v in list(e.attributes.items())[:5])
            entities_summary += f"- [{e.entity_type.value}] {e.name} (conf: {e.confidence:.2f}) {attrs}\n"
        if not entities_summary:
            entities_summary = "(No entities discovered yet)"

        recent = state.search_history[-3:] if state.search_history else []
        recent_findings = ""
        for r in recent:
            snippets = "\n  ".join(r.raw_snippets[:3])
            recent_findings += f'Query: "{r.query}" → {r.num_results} results\n  {snippets}\n\n'
        if not recent_findings:
            recent_findings = "(No searches executed yet)"

        search_hist = (
            "\n".join(f'- "{r.query}" [{r.provider}, {r.num_results} results]' for r in state.search_history)
            or "(None)"
        )

        hypotheses = (
            "\n".join(f"- [{h.priority}/10] {h.description} (status: {h.status})" for h in state.get_open_hypotheses())
            or "(No open hypotheses)"
        )

        gaps = (
            "\n".join(f"- {g}" for g in (state.last_decision.gaps_identified if state.last_decision else []))
            or "(Initial investigation — gaps unknown)"
        )

        return RESEARCH_DIRECTOR_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            current_role=state.subject.current_role or "Unknown",
            current_org=state.subject.current_organization or "Unknown",
            subject_summary=state.subject.summary or "No summary yet",
            current_phase=state.current_phase.value,
            iteration=state.iteration,
            max_iterations=state.max_iterations,
            num_entities=len(state.entities),
            num_connections=len(state.connections),
            num_risk_flags=len(state.risk_flags),
            overall_confidence=state.overall_confidence,
            entities_summary=entities_summary,
            recent_findings=recent_findings,
            search_history=search_hist,
            hypotheses=hypotheses,
            gaps=gaps,
        )

    def _parse_decision(self, raw: str, state: ResearchState) -> DirectorDecision:
        """Parse LLM response into DirectorDecision."""
        json_str = raw
        if "```json" in raw:
            json_str = raw.split("```json")[1].split("```")[0]
        elif "```" in raw:
            json_str = raw.split("```")[1].split("```")[0]
        start = json_str.find("{")
        end = json_str.rfind("}") + 1
        if start >= 0 and end > start:
            json_str = json_str[start:end]
        try:
            data = json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            logger.warning("director_json_parse_failed", raw_preview=raw[:300])
            return self._fallback_decision(state)

        action_str = data.get("next_action", "search_web").lower()
        action_map = {
            "search_web": AgentAction.SEARCH_WEB,
            "extract_facts": AgentAction.EXTRACT_FACTS,
            "analyze_risks": AgentAction.ANALYZE_RISKS,
            "map_connections": AgentAction.MAP_CONNECTIONS,
            "verify_sources": AgentAction.VERIFY_SOURCES,
            "generate_report": AgentAction.GENERATE_REPORT,
            "terminate": AgentAction.TERMINATE,
        }
        next_action = action_map.get(action_str, AgentAction.SEARCH_WEB)

        phase_str = data.get("current_phase", state.current_phase.value).lower()
        phase_map = {p.value: p for p in SearchPhase}
        current_phase = phase_map.get(phase_str, state.current_phase)

        used_queries = state.get_search_queries_used()
        new_queries = [q for q in data.get("search_queries", []) if q.lower().strip() not in used_queries]

        return DirectorDecision(
            reasoning=data.get("reasoning", "No reasoning provided"),
            next_action=next_action,
            search_queries=new_queries[:5],
            target_entity_ids=data.get("target_entity_ids", []),
            current_phase=current_phase,
            confidence_in_completeness=float(data.get("confidence_in_completeness", 0.0)),
            gaps_identified=data.get("gaps_identified", []),
        )

    def _fallback_decision(self, state: ResearchState) -> DirectorDecision:
        """Safe default when parsing fails or LLM errors."""
        subject = state.subject
        used = state.get_search_queries_used()

        if state.iteration <= 1:
            candidates = [
                f"{subject.full_name} {subject.current_organization or ''}".strip(),
                f"{subject.full_name} LinkedIn background",
                f"{subject.full_name} biography",
            ]
            queries = [q for q in candidates if q.lower().strip() not in used][:2]
            if not queries:
                queries = candidates[:1]
            return DirectorDecision(
                reasoning="Fallback: Initial baseline search for subject",
                next_action=AgentAction.SEARCH_WEB,
                search_queries=queries,
                current_phase=SearchPhase.BASELINE,
                confidence_in_completeness=0.0,
                gaps_identified=["Everything — this is the first search"],
            )

        if state.iteration >= state.max_iterations - 1:
            return DirectorDecision(
                reasoning="Fallback: Approaching max iterations, generating report",
                next_action=AgentAction.GENERATE_REPORT,
                current_phase=SearchPhase.SYNTHESIS,
                confidence_in_completeness=state.overall_confidence,
            )

        entity_names = [e.name for e in state.entities[:5]]
        queries = [
            f"{subject.full_name} {name}"
            for name in entity_names[:3]
            if f"{subject.full_name} {name}".lower().strip() not in used
        ]
        if not queries:
            phase_keywords = {
                SearchPhase.BASELINE: ["career history", "education"],
                SearchPhase.BREADTH: ["SEC filings", "board memberships"],
                SearchPhase.DEPTH: ["controversy", "legal disputes"],
                SearchPhase.ADVERSARIAL: ["lawsuit", "fraud allegations"],
                SearchPhase.TRIANGULATION: ["interview quotes", "public statements"],
            }
            keywords = phase_keywords.get(state.current_phase, ["news", "profile"])
            queries = [
                f"{subject.full_name} {kw}"
                for kw in keywords
                if f"{subject.full_name} {kw}".lower().strip() not in used
            ][:2]
        if not queries:
            return DirectorDecision(
                reasoning="Fallback: All fallback queries already used, generating report",
                next_action=AgentAction.GENERATE_REPORT,
                current_phase=SearchPhase.SYNTHESIS,
                confidence_in_completeness=state.overall_confidence,
            )

        return DirectorDecision(
            reasoning="Fallback: Exploring discovered entities or phase-appropriate queries",
            next_action=AgentAction.SEARCH_WEB,
            search_queries=queries,
            current_phase=state.current_phase,
            confidence_in_completeness=min(state.overall_confidence + 0.05, 0.5),
        )
