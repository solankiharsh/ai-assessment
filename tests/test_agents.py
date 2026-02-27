"""Agent tests with canned/mock responses where applicable."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.agents.fact_extractor import FactExtractionAgent
from src.agents.report_generator import ReportGenerator
from src.agents.research_director import ResearchDirector
from src.agents.risk_analyzer import RiskAnalysisAgent
from src.agents.risk_debate import RiskProponentAgent, RiskSkepticAgent
from src.llm_client import LLMClient
from src.models import (
    AgentAction,
    Entity,
    EntityType,
    ResearchState,
    RiskCategory,
    RiskFlag,
    RiskSeverity,
    SearchPhase,
    SearchRecord,
    SubjectProfile,
)


@pytest.fixture
def minimal_state() -> ResearchState:
    return ResearchState(
        subject=SubjectProfile(
            full_name="Test Person",
            current_role="CEO",
            current_organization="Test Corp",
        ),
        entities=[
            Entity(name="Test Person", entity_type=EntityType.PERSON, confidence=0.9),
            Entity(name="Test Corp", entity_type=EntityType.ORGANIZATION, confidence=0.8),
        ],
        risk_flags=[
            RiskFlag(
                category=RiskCategory.REPUTATIONAL,
                severity=RiskSeverity.LOW,
                title="Minor gap",
                description="Unverified claim",
                confidence=0.5,
            )
        ],
    )


@pytest.fixture
def empty_state() -> ResearchState:
    return ResearchState(
        subject=SubjectProfile(
            full_name="Test Person",
            current_role="CEO",
            current_organization="Test Corp",
        ),
    )


class TestReportGeneratorFallback:
    """Report generator fallback when LLM is not available or errors."""

    @pytest.mark.asyncio
    async def test_fallback_report_on_error(self, minimal_state: ResearchState) -> None:
        """When generate raises, fallback report is used."""
        client = LLMClient(budget_usd=0)
        gen = ReportGenerator(client)

        async def _mock_fail(*args: object, **kwargs: object) -> str:
            raise RuntimeError("mock failure")

        gen.llm.generate_for_tier = _mock_fail
        state = await gen.generate_report(minimal_state)
        assert state.final_report
        assert "Due Diligence Report" in state.final_report
        assert "Test Person" in state.final_report
        assert state.should_terminate


class TestDirectorPersistentFailureDetection:
    """Director should abort early when LLM keeps failing."""

    @pytest.mark.asyncio
    async def test_aborts_after_consecutive_failures(self, empty_state: ResearchState) -> None:
        """After N consecutive LLM failures, director goes to GENERATE_REPORT."""
        client = LLMClient(budget_usd=0)
        director = ResearchDirector(client)

        async def _mock_fail(*args: object, **kwargs: object) -> str:
            raise RuntimeError("expired API key")

        director.llm.generate_for_tier = _mock_fail

        for i in range(director.CONSECUTIVE_FAILURE_LIMIT):
            empty_state.iteration = i
            decision = await director.plan_next_step(empty_state)
            assert decision.next_action == AgentAction.SEARCH_WEB

        empty_state.iteration = director.CONSECUTIVE_FAILURE_LIMIT
        decision = await director.plan_next_step(empty_state)
        assert decision.next_action == AgentAction.GENERATE_REPORT
        assert "failed" in decision.reasoning.lower()

    @pytest.mark.asyncio
    async def test_resets_counter_on_success(self, empty_state: ResearchState) -> None:
        """A successful LLM call resets the consecutive failure counter."""
        client = LLMClient(budget_usd=0)
        director = ResearchDirector(client)

        call_count = 0

        async def _fail_then_succeed(*args: object, **kwargs: object) -> str:
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise RuntimeError("expired")
            return '{"next_action": "search_web", "search_queries": ["test"], "reasoning": "ok"}'

        director.llm.generate_for_tier = _fail_then_succeed

        empty_state.iteration = 0
        await director.plan_next_step(empty_state)
        assert director._consecutive_llm_failures == 1

        empty_state.iteration = 1
        await director.plan_next_step(empty_state)
        assert director._consecutive_llm_failures == 2

        empty_state.iteration = 2
        await director.plan_next_step(empty_state)
        assert director._consecutive_llm_failures == 0


class TestDirectorFallbackQueryDedup:
    """Fallback queries should vary across iterations, not repeat."""

    @pytest.mark.asyncio
    async def test_fallback_deduplicates_queries(self, empty_state: ResearchState) -> None:
        """Second fallback should produce different queries than the first."""
        client = LLMClient(budget_usd=0)
        director = ResearchDirector(client)

        async def _mock_fail(*args: object, **kwargs: object) -> str:
            raise RuntimeError("mock failure")

        director.llm.generate_for_tier = _mock_fail

        empty_state.iteration = 0
        d1 = await director.plan_next_step(empty_state)
        assert d1.search_queries

        for q in d1.search_queries:
            empty_state.search_history.append(
                SearchRecord(query=q, provider="tavily", phase=SearchPhase.BASELINE, iteration=0)
            )

        empty_state.iteration = 1
        d2 = await director.plan_next_step(empty_state)
        assert d2.search_queries
        for q2 in d2.search_queries:
            assert q2 not in d1.search_queries, f"Repeated query: {q2}"


class TestFactExtractorZeroYieldRecording:
    """Fact extractor must record 0-yield even when there's no content."""

    @pytest.mark.asyncio
    async def test_records_zero_yield_on_empty_content(self, empty_state: ResearchState) -> None:
        """When pending_content is empty, still record (0, 0) for diminishing returns."""
        client = LLMClient(budget_usd=0)
        extractor = FactExtractionAgent(client)

        assert len(empty_state.entities_added_per_iteration) == 0

        await extractor.extract_facts(empty_state)

        assert len(empty_state.entities_added_per_iteration) == 1
        assert empty_state.entities_added_per_iteration[0] == 0


class TestRiskDebate:
    """Adversarial debate: proponent and skeptic arguments are passed to the judge."""

    @pytest.mark.asyncio
    async def test_judge_receives_both_arguments(self, minimal_state: ResearchState) -> None:
        """Risk analyzer receives proponent and skeptic arguments in its prompt."""
        client = LLMClient(budget_usd=0)
        agent = RiskAnalysisAgent(client)

        with (
            patch.object(
                RiskProponentAgent,
                "argue",
                new_callable=AsyncMock,
                return_value="Proponent: these findings are concerning.",
            ),
            patch.object(
                RiskSkepticAgent,
                "argue",
                new_callable=AsyncMock,
                return_value="Skeptic: these findings are explainable.",
            ),
            patch.object(
                client,
                "generate_for_tier",
                new_callable=AsyncMock,
                return_value='{"risk_flags": [], "overall_risk_assessment": "low", "summary": "ok"}',
            ) as mock_judge,
        ):
            await agent.analyze_risks(minimal_state)
            mock_judge.assert_called()
            calls = [c for c in mock_judge.call_args_list if c[1].get("user_prompt")]
            assert len(calls) >= 1
            user_prompt = calls[-1][1]["user_prompt"]
            assert "Proponent: these findings are concerning." in user_prompt
            assert "Skeptic: these findings are explainable." in user_prompt

    @pytest.mark.asyncio
    async def test_graceful_degradation_when_debate_fails(self, minimal_state: ResearchState) -> None:
        """When debate agents fail (empty), judge still runs with fallback text."""
        client = LLMClient(budget_usd=0)
        agent = RiskAnalysisAgent(client)

        with (
            patch.object(
                RiskProponentAgent,
                "argue",
                new_callable=AsyncMock,
                return_value="",
            ),
            patch.object(
                RiskSkepticAgent,
                "argue",
                new_callable=AsyncMock,
                return_value="",
            ),
            patch.object(
                client,
                "generate_for_tier",
                new_callable=AsyncMock,
                return_value='{"risk_flags": [], "overall_risk_assessment": "low", "summary": "ok"}',
            ) as mock_judge,
        ):
            await agent.analyze_risks(minimal_state)
            mock_judge.assert_called()
            calls = [c for c in mock_judge.call_args_list if c[1].get("user_prompt")]
            assert len(calls) >= 1
            user_prompt = calls[-1][1]["user_prompt"]
            assert "(No proponent argument available.)" in user_prompt
            assert "(No skeptic argument available.)" in user_prompt
