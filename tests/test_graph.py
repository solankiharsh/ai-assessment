"""Integration tests for LangGraph routing and graph structure."""

import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.graph import ResearchGraph
from src.models import (
    AgentAction,
    DirectorDecision,
    ResearchState,
    SearchPhase,
    SubjectProfile,
)


@pytest.fixture
def initial_state() -> ResearchState:
    return ResearchState(
        subject=SubjectProfile(
            full_name="Test Subject",
            current_role="CEO",
            current_organization="Test Corp",
        ),
        max_iterations=2,
    )


def _decision(action: AgentAction) -> DirectorDecision:
    return DirectorDecision(
        reasoning="test",
        next_action=action,
        search_queries=[],
        current_phase=SearchPhase.BASELINE,
    )


class TestResearchGraphRouting:
    """Verify routing logic without running real LLM/search."""

    def test_route_from_director_search_web(self) -> None:
        graph = ResearchGraph()
        state = ResearchState(subject=SubjectProfile(full_name="X", current_role="", current_organization=""))
        state.last_decision = _decision(AgentAction.SEARCH_WEB)
        route = graph._route_from_director(state.model_dump())
        assert route == "web_research"

    def test_route_from_director_generate_report(self) -> None:
        graph = ResearchGraph()
        state = ResearchState(subject=SubjectProfile(full_name="X", current_role="", current_organization=""))
        state.should_terminate = True
        route = graph._route_from_director(state.model_dump())
        assert route == "end"

    def test_route_from_director_risk_analysis(self) -> None:
        graph = ResearchGraph()
        state = ResearchState(subject=SubjectProfile(full_name="X", current_role="", current_organization=""))
        state.last_decision = _decision(AgentAction.ANALYZE_RISKS)
        route = graph._route_from_director(state.model_dump())
        assert route == "risk_analysis"

    def test_route_from_director_no_decision_defaults_web_research(self) -> None:
        graph = ResearchGraph()
        state = ResearchState(subject=SubjectProfile(full_name="X", current_role="", current_organization=""))
        state.last_decision = None
        route = graph._route_from_director(state.model_dump())
        assert route == "web_research"


class TestDebugSnapshots:
    """Per-iteration debug snapshots when debug=True."""

    @pytest.mark.asyncio
    async def test_debug_snapshots_written(self, initial_state: ResearchState, tmp_path: Path) -> None:
        """When debug=True, director node writes iteration_N.json to output_dir/subject_slug/."""
        graph = ResearchGraph(debug=True, output_dir=str(tmp_path))
        graph.director.plan_next_step = AsyncMock(return_value=_decision(AgentAction.GENERATE_REPORT))
        state_dict = initial_state.model_dump()
        result = await graph._director_node(state_dict)
        assert result["iteration"] == 1
        slug = "test_subject"
        snapshot_dir = tmp_path / slug
        assert snapshot_dir.is_dir()
        snapshot_file = snapshot_dir / "iteration_1.json"
        assert snapshot_file.is_file()
        data = json.loads(snapshot_file.read_text())
        assert data["iteration"] == 1
        assert data["subject"]["full_name"] == "Test Subject"
