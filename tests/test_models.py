"""
Unit tests for core data models.

Verifies state management logic independently of LLMs: entity deduplication
(exact and fuzzy), connection tracking, diminishing returns recording,
and confidence scoring.
"""

import pytest

from src.models import (
    Connection,
    Entity,
    EntityType,
    Hypothesis,
    RelationshipType,
    ResearchState,
    RiskCategory,
    RiskFlag,
    RiskSeverity,
    SearchRecord,
    SubjectProfile,
)


@pytest.fixture
def empty_state() -> ResearchState:
    """A fresh investigation state."""
    return ResearchState(
        subject=SubjectProfile(
            full_name="Test Subject",
            current_role="CEO",
            current_organization="Test Corp",
        )
    )


@pytest.fixture
def populated_state(empty_state: ResearchState) -> ResearchState:
    """State with some entities and connections."""
    state = empty_state
    e1 = Entity(name="Alice Smith", entity_type=EntityType.PERSON, confidence=0.8)
    e2 = Entity(name="Acme Corp", entity_type=EntityType.ORGANIZATION, confidence=0.9)
    state.add_entity(e1)
    state.add_entity(e2)
    state.add_connection(
        Connection(
            source_entity_id=e1.id,
            target_entity_id=e2.id,
            relationship_type=RelationshipType.WORKS_AT,
            confidence=0.85,
        )
    )
    return state


class TestEntityDeduplication:
    """Entity dedup is critical — we can't have duplicate nodes in the graph."""

    def test_add_new_entity(self, empty_state: ResearchState) -> None:
        entity = Entity(name="John Doe", entity_type=EntityType.PERSON)
        result = empty_state.add_entity(entity)
        assert len(empty_state.entities) == 1
        assert result.name == "John Doe"

    def test_dedup_by_exact_name(self, empty_state: ResearchState) -> None:
        e1 = Entity(name="John Doe", entity_type=EntityType.PERSON, confidence=0.5)
        e2 = Entity(name="John Doe", entity_type=EntityType.PERSON, confidence=0.9)
        empty_state.add_entity(e1)
        empty_state.add_entity(e2)
        assert len(empty_state.entities) == 1
        assert empty_state.entities[0].confidence == 0.9

    def test_dedup_case_insensitive(self, empty_state: ResearchState) -> None:
        e1 = Entity(name="John Doe", entity_type=EntityType.PERSON)
        e2 = Entity(name="john doe", entity_type=EntityType.PERSON)
        empty_state.add_entity(e1)
        empty_state.add_entity(e2)
        assert len(empty_state.entities) == 1

    def test_dedup_merges_sources(self, empty_state: ResearchState) -> None:
        e1 = Entity(
            name="Corp X",
            entity_type=EntityType.ORGANIZATION,
            source_urls=["http://a.com"],
        )
        e2 = Entity(
            name="Corp X",
            entity_type=EntityType.ORGANIZATION,
            source_urls=["http://b.com"],
        )
        empty_state.add_entity(e1)
        empty_state.add_entity(e2)
        assert len(empty_state.entities[0].source_urls) == 2

    def test_find_by_alias(self, empty_state: ResearchState) -> None:
        e = Entity(
            name="International Business Machines",
            entity_type=EntityType.ORGANIZATION,
            aliases=["IBM"],
        )
        empty_state.add_entity(e)
        found = empty_state.find_entity_by_name("IBM")
        assert found is not None
        assert found.name == "International Business Machines"

    def test_find_entity_by_name_fuzzy(self, empty_state: ResearchState) -> None:
        empty_state.add_entity(Entity(name="Sisu Capital LLC", entity_type=EntityType.ORGANIZATION))
        found = empty_state.find_entity_by_name_fuzzy("Sisu Capital", threshold=0.8)
        assert found is not None
        assert "Sisu" in found.name and "Capital" in found.name

    def test_add_entity_with_fuzzy_threshold_merges(self, empty_state: ResearchState) -> None:
        empty_state.add_entity(Entity(name="Sisu Capital LLC", entity_type=EntityType.ORGANIZATION))
        added = Entity(name="Sisu Capital", entity_type=EntityType.ORGANIZATION)
        result = empty_state.add_entity(added, fuzzy_threshold=0.85)
        assert len(empty_state.entities) == 1
        assert result.name == "Sisu Capital LLC"


class TestConnectionTracking:
    def test_add_connection(self, populated_state: ResearchState) -> None:
        assert len(populated_state.connections) == 1
        conn = populated_state.connections[0]
        assert conn.relationship_type == RelationshipType.WORKS_AT

    def test_dedup_connections(self, populated_state: ResearchState) -> None:
        e1 = populated_state.entities[0]
        e2 = populated_state.entities[1]
        dup_conn = Connection(
            source_entity_id=e1.id,
            target_entity_id=e2.id,
            relationship_type=RelationshipType.WORKS_AT,
            confidence=0.95,
        )
        populated_state.add_connection(dup_conn)
        assert len(populated_state.connections) == 1
        assert populated_state.connections[0].confidence == 0.95


class TestSearchHistory:
    def test_query_dedup_tracking(self, empty_state: ResearchState) -> None:
        empty_state.search_history.append(SearchRecord(query="test query", provider="tavily", num_results=5))
        used = empty_state.get_search_queries_used()
        assert "test query" in used

    def test_open_hypotheses(self, empty_state: ResearchState) -> None:
        empty_state.hypotheses.append(Hypothesis(description="H1", status="open"))
        empty_state.hypotheses.append(Hypothesis(description="H2", status="confirmed"))
        open_h = empty_state.get_open_hypotheses()
        assert len(open_h) == 1
        assert open_h[0].description == "H1"


class TestDiminishingReturns:
    def test_record_iteration_yield(self, empty_state: ResearchState) -> None:
        empty_state.record_iteration_yield(3, 5)
        empty_state.record_iteration_yield(1, 2)
        assert empty_state.entities_added_per_iteration == [3, 1]
        assert empty_state.facts_added_per_iteration == [5, 2]

    def test_record_iteration_yield_caps_at_10(self, empty_state: ResearchState) -> None:
        for _ in range(15):
            empty_state.record_iteration_yield(1, 1)
        assert len(empty_state.entities_added_per_iteration) == 10
        assert len(empty_state.facts_added_per_iteration) == 10


class TestRiskFlags:
    def test_risk_flag_creation(self) -> None:
        flag = RiskFlag(
            category=RiskCategory.LITIGATION,
            severity=RiskSeverity.HIGH,
            title="Active lawsuit",
            description="Subject is defendant in pending fraud case",
            evidence=["https://courts.gov/case/123"],
            confidence=0.85,
        )
        assert flag.severity == RiskSeverity.HIGH
        assert len(flag.evidence) == 1


class TestSubjectProfile:
    def test_initial_profile(self) -> None:
        profile = SubjectProfile(
            full_name="Timothy Overturf",
            current_role="CEO",
            current_organization="Sisu Capital",
        )
        assert profile.full_name == "Timothy Overturf"
        assert profile.aliases == []
        assert profile.education == []
