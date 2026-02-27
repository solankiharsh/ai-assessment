"""
Core data models for the Deep Research Agent.

These Pydantic models define the typed state that flows through the LangGraph
state machine. Every piece of information the agent discovers, every hypothesis
it forms, and every risk it flags is represented here.

Design principles:
  - Every fact carries provenance (source_urls, confidence)
  - Entities are typed and deduplicated via canonical IDs (exact + optional fuzzy)
  - Diminishing returns tracked per iteration for intelligent termination
  - The state is serializable for LangSmith tracing and Neo4j persistence
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

# Use timezone-aware UTC (datetime.utcnow is deprecated in Python 3.12+)
UTC = timezone.utc


def _now_utc() -> datetime:
    return datetime.now(UTC)


# ═══════════════════════════════════════════════════════════
# Enums
# ═══════════════════════════════════════════════════════════


class EntityType(str, Enum):
    """Types of entities the agent can discover."""

    PERSON = "person"
    ORGANIZATION = "organization"
    LOCATION = "location"
    EVENT = "event"
    DOCUMENT = "document"
    FINANCIAL_INSTRUMENT = "financial_instrument"


class RelationshipType(str, Enum):
    """Types of relationships between entities."""

    WORKS_AT = "WORKS_AT"
    BOARD_MEMBER_OF = "BOARD_MEMBER_OF"
    FOUNDED = "FOUNDED"
    INVESTED_IN = "INVESTED_IN"
    SUBSIDIARY_OF = "SUBSIDIARY_OF"
    RELATED_TO = "RELATED_TO"
    KNOWS = "KNOWS"
    FAMILY_OF = "FAMILY_OF"
    SUED_BY = "SUED_BY"
    REGULATED_BY = "REGULATED_BY"
    MENTIONED_IN = "MENTIONED_IN"
    PARTNER_OF = "PARTNER_OF"
    ADVISOR_TO = "ADVISOR_TO"
    DONOR_TO = "DONOR_TO"
    PREVIOUSLY_AT = "PREVIOUSLY_AT"


class RiskSeverity(str, Enum):
    """Risk flag severity levels."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class RiskCategory(str, Enum):
    """Categories of risk patterns."""

    REGULATORY = "regulatory"
    LITIGATION = "litigation"
    FINANCIAL = "financial"
    REPUTATIONAL = "reputational"
    ASSOCIATION = "association"
    INCONSISTENCY = "inconsistency"
    SANCTIONS = "sanctions"
    POLITICAL_EXPOSURE = "political_exposure"


class SearchPhase(str, Enum):
    """Phases of the consecutive search strategy."""

    BASELINE = "baseline"
    BREADTH = "breadth"
    DEPTH = "depth"
    ADVERSARIAL = "adversarial"
    TRIANGULATION = "triangulation"
    SYNTHESIS = "synthesis"


class AgentAction(str, Enum):
    """Actions the Research Director can dispatch."""

    SEARCH_WEB = "search_web"
    EXTRACT_FACTS = "extract_facts"
    ANALYZE_RISKS = "analyze_risks"
    MAP_CONNECTIONS = "map_connections"
    VERIFY_SOURCES = "verify_sources"
    UPDATE_GRAPH = "update_graph"
    GENERATE_REPORT = "generate_report"
    TERMINATE = "terminate"


# ═══════════════════════════════════════════════════════════
# Core Data Models
# ═══════════════════════════════════════════════════════════


class ConfidenceScore(BaseModel):
    """Multi-factor confidence scoring for an entity or claim."""

    source_authority: float = 0.5
    corroboration_count: int = 0
    recency_score: float = 0.5
    internal_consistency: float = 0.5
    extraction_clarity: float = 0.5

    # Weights for the composite score
    _WEIGHTS: dict[str, float] = {
        "source_authority": 0.30,
        "corroboration": 0.25,
        "recency": 0.15,
        "consistency": 0.15,
        "clarity": 0.15,
    }

    @property
    def weighted_score(self) -> float:
        """Compute the weighted composite confidence score (0.0-1.0)."""
        w = self._WEIGHTS
        corroboration_normalized = min(self.corroboration_count / 5.0, 1.0)
        score = (
            w["source_authority"] * self.source_authority
            + w["corroboration"] * corroboration_normalized
            + w["recency"] * self.recency_score
            + w["consistency"] * self.internal_consistency
            + w["clarity"] * self.extraction_clarity
        )
        return min(max(score, 0.0), 1.0)


class SourceReference(BaseModel):
    """A reference to an information source with authority scoring."""

    url: str
    title: str = ""
    domain: str = ""
    accessed_at: datetime = Field(default_factory=_now_utc)
    source_type: str = "web"  # web, filing, court_record, social_media, news
    authority_score: float = 0.5  # 0.0-1.0, higher = more authoritative

    def compute_authority(self) -> float:
        """Heuristic authority scoring based on domain type. Reads from YAML config with hardcoded fallbacks."""
        from src.config import get_settings

        sa = get_settings().source_authority
        high_authority = sa.get("high_authority", [
            "sec.gov", "courts.gov", "edgar", "bloomberg.com",
            "reuters.com", "wsj.com", "ft.com", "linkedin.com",
        ])
        medium_authority = sa.get("medium_authority", [
            "crunchbase.com", "pitchbook.com", "businesswire.com",
            "prnewswire.com", "wikipedia.org", "nytimes.com",
        ])
        overrides = sa.get("overrides", {})
        gov_edu_score = sa.get("gov_edu_authority", 0.85)
        default_score = sa.get("default_authority", 0.4)

        domain_lower = self.domain.lower()
        # Check overrides first
        for pattern, score in overrides.items():
            if pattern in domain_lower:
                return float(score)
        if any(d in domain_lower for d in high_authority):
            return 0.9
        if any(d in domain_lower for d in medium_authority):
            return 0.7
        if ".gov" in domain_lower or ".edu" in domain_lower:
            return float(gov_edu_score)
        return float(default_score)


class Entity(BaseModel):
    """A discovered entity (person, org, location, etc.)."""

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    name: str
    entity_type: EntityType
    aliases: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)
    source_urls: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    first_seen_iteration: int = 0
    description: str = ""
    confidence_detail: Optional[ConfidenceScore] = None

    @field_validator("description", mode="before")
    @classmethod
    def _coerce_none_description(cls, v: Any) -> Any:
        return v if v is not None else ""

    @property
    def canonical_key(self) -> str:
        """Deterministic key for deduplication."""
        normalized = (self.name or "").lower().strip()
        return hashlib.md5(f"{self.entity_type}:{normalized}".encode()).hexdigest()[:12]


class Connection(BaseModel):
    """A relationship between two entities."""

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    source_entity_id: str
    target_entity_id: str
    relationship_type: RelationshipType
    description: str = ""
    attributes: dict[str, Any] = Field(default_factory=dict)
    source_urls: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    start_date: Optional[str] = None
    end_date: Optional[str] = None

    @field_validator("description", mode="before")
    @classmethod
    def _coerce_none_description(cls, v: Any) -> Any:
        return v if v is not None else ""


class RiskFlag(BaseModel):
    """A flagged risk or concern."""

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    category: RiskCategory
    severity: RiskSeverity
    title: str
    description: str
    evidence: list[str] = Field(default_factory=list)  # source URLs
    entity_ids: list[str] = Field(default_factory=list)  # affected entities
    confidence: float = 0.5
    mitigating_factors: list[str] = Field(default_factory=list)

    @field_validator("title", "description", mode="before")
    @classmethod
    def _coerce_none_str(cls, v: Any) -> Any:
        return v if v is not None else ""


class TemporalFact(BaseModel):
    """A fact anchored to a specific time period."""

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    claim: str
    entity_id: str = ""
    date_range: tuple[Optional[str], Optional[str]] = (None, None)
    as_of_date: Optional[str] = None
    source_urls: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    category: str = "event"  # employment, registration, filing, event

    @field_validator("claim", mode="before")
    @classmethod
    def _coerce_none_claim(cls, v: Any) -> Any:
        return v if v is not None else ""


class TemporalContradiction(BaseModel):
    """A detected contradiction between two temporal facts."""

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    fact_a_id: str
    fact_b_id: str
    description: str = ""
    severity: RiskSeverity = RiskSeverity.MEDIUM
    confidence: float = 0.5


class Hypothesis(BaseModel):
    """An active investigation thread the Research Director is pursuing."""

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    description: str
    status: str = "open"  # open, confirmed, refuted, inconclusive
    priority: int = 5  # 1-10, higher = more important
    related_entity_ids: list[str] = Field(default_factory=list)
    search_queries_tried: list[str] = Field(default_factory=list)
    evidence_for: list[str] = Field(default_factory=list)
    evidence_against: list[str] = Field(default_factory=list)


class SearchRecord(BaseModel):
    """Record of a single search operation and its results."""

    query: str
    provider: str = "tavily"  # tavily, brave, direct_fetch
    phase: SearchPhase = SearchPhase.BASELINE
    iteration: int = 0
    timestamp: datetime = Field(default_factory=_now_utc)
    num_results: int = 0
    result_urls: list[str] = Field(default_factory=list)
    raw_snippets: list[str] = Field(default_factory=list)
    was_useful: bool = True


class SubjectProfile(BaseModel):
    """The accumulated profile of the investigation subject."""

    full_name: str
    aliases: list[str] = Field(default_factory=list)
    date_of_birth: Optional[str] = None
    current_role: Optional[str] = None
    current_organization: Optional[str] = None
    education: list[dict[str, str]] = Field(default_factory=list)
    professional_history: list[dict[str, str]] = Field(default_factory=list)
    known_associations: list[str] = Field(default_factory=list)
    summary: str = ""


class DirectorDecision(BaseModel):
    """Output of the Research Director's planning step."""

    reasoning: str
    next_action: AgentAction
    search_queries: list[str] = Field(default_factory=list)
    target_entity_ids: list[str] = Field(default_factory=list)
    current_phase: SearchPhase = SearchPhase.BASELINE
    confidence_in_completeness: float = 0.0  # How complete is the investigation?
    gaps_identified: list[str] = Field(default_factory=list)


def _normalize_name_for_fuzzy(name: str) -> str:
    """Strip titles, punctuation, and extra spaces for fuzzy matching."""
    if name is None:
        return ""
    s = (name if isinstance(name, str) else str(name)).lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[.,\-&']", "", s)
    return s


# ═══════════════════════════════════════════════════════════
# LangGraph State (the central state object)
# ═══════════════════════════════════════════════════════════


class ResearchState(BaseModel):
    """
    The central state object that flows through the LangGraph state machine.

    This is the single source of truth for the entire investigation. Every node
    in the graph reads from and writes to this state. LangGraph manages state
    persistence and enables time-travel debugging via LangSmith.

    Diminishing returns: entities_added_per_iteration and facts_added_per_iteration
    record counts for the last N iterations so the director can terminate when
    the last 2 iterations yield < 2 new entities.
    """

    # ── Subject ──
    subject: SubjectProfile

    # ── Accumulated Knowledge ──
    entities: list[Entity] = Field(default_factory=list)
    connections: list[Connection] = Field(default_factory=list)
    risk_flags: list[RiskFlag] = Field(default_factory=list)

    # ── Search Management ──
    search_history: list[SearchRecord] = Field(default_factory=list)
    hypotheses: list[Hypothesis] = Field(default_factory=list)

    # ── Raw Content Buffer ──
    pending_content: list[dict[str, Any]] = Field(default_factory=list)

    # ── Director State ──
    current_phase: SearchPhase = SearchPhase.BASELINE
    iteration: int = 0
    max_iterations: int = 8
    last_decision: Optional[DirectorDecision] = None

    # ── Diminishing returns (for intelligent termination) ──
    entities_added_per_iteration: list[int] = Field(default_factory=list)
    facts_added_per_iteration: list[int] = Field(default_factory=list)

    # ── Confidence Tracking ──
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    overall_confidence: float = 0.0

    # ── Cost Tracking ──
    total_llm_calls: int = 0
    total_search_calls: int = 0
    estimated_cost_usd: float = 0.0

    # ── Control Flow ──
    should_terminate: bool = False
    error_log: list[str] = Field(default_factory=list)

    # ── Sources identified but not retrievable (403, timeout, no Wayback, etc.) ──
    inaccessible_urls: list[dict[str, Any]] = Field(
        default_factory=list,
        description="URLs we could not fetch: {url, reason, query?, phase?}",
    )

    # ── Temporal Intelligence ──
    temporal_facts: list[TemporalFact] = Field(default_factory=list)
    temporal_contradictions: list[TemporalContradiction] = Field(default_factory=list)

    # ── Risk Debate Transcript ──
    risk_debate_transcript: list[dict[str, str]] = Field(default_factory=list)

    # ── Graph Insights (from Neo4j queries) ──
    graph_insights: list[dict[str, Any]] = Field(default_factory=list)

    # ── PII Annotations ──
    pii_annotations: list[dict[str, str]] = Field(default_factory=list)

    # ── Final Output ──
    final_report: str = ""
    redacted_report: str = ""

    def get_entity_by_id(self, entity_id: str) -> Optional[Entity]:
        """Look up an entity by ID."""
        return next((e for e in self.entities if e.id == entity_id), None)

    def find_entity_by_name(self, name: str) -> Optional[Entity]:
        """Exact lookup by name or alias (case-insensitive)."""
        if name is None:
            return None
        name_lower = (name if isinstance(name, str) else str(name)).lower().strip()
        for entity in self.entities:
            if entity.name and entity.name.lower().strip() == name_lower:
                return entity
            if name_lower in [ (a or "").lower().strip() for a in entity.aliases ]:
                return entity
        return None

    def find_entity_by_name_fuzzy(self, name: str, threshold: float = 0.85) -> Optional[Entity]:
        """Find best-matching entity by fuzzy name similarity (e.g. JPMorgan vs JP Morgan)."""
        if name is None:
            return None
        try:
            from rapidfuzz import fuzz
        except ImportError:
            return self.find_entity_by_name(name)

        name_norm = _normalize_name_for_fuzzy(name if isinstance(name, str) else str(name))
        if not name_norm:
            return None

        best_score = 0.0
        best_entity: Optional[Entity] = None
        for entity in self.entities:
            cand_norm = _normalize_name_for_fuzzy(entity.name)
            score = fuzz.ratio(name_norm, cand_norm) / 100.0
            if score >= threshold and score > best_score:
                best_score = score
                best_entity = entity
            for alias in entity.aliases:
                alias_norm = _normalize_name_for_fuzzy(alias)
                score = fuzz.ratio(name_norm, alias_norm) / 100.0
                if score >= threshold and score > best_score:
                    best_score = score
                    best_entity = entity
        return best_entity

    def add_entity(self, entity: Entity, fuzzy_threshold: Optional[float] = None) -> Entity:
        """Add entity with deduplication. Uses exact match, or fuzzy if fuzzy_threshold set."""
        existing = self.find_entity_by_name(entity.name)
        if existing is None and fuzzy_threshold is not None:
            existing = self.find_entity_by_name_fuzzy(entity.name, fuzzy_threshold)
        if existing:
            existing.confidence = max(existing.confidence, entity.confidence)
            existing.source_urls = list(set(existing.source_urls + entity.source_urls))
            existing.aliases = list(set(existing.aliases + entity.aliases))
            existing.attributes.update(entity.attributes)
            return existing
        self.entities.append(entity)
        return entity

    def add_connection(self, connection: Connection) -> None:
        """Add connection with deduplication."""
        for existing in self.connections:
            if (
                existing.source_entity_id == connection.source_entity_id
                and existing.target_entity_id == connection.target_entity_id
                and existing.relationship_type == connection.relationship_type
            ):
                existing.confidence = max(existing.confidence, connection.confidence)
                existing.source_urls = list(set(existing.source_urls + connection.source_urls))
                return
        self.connections.append(connection)

    def get_search_queries_used(self) -> set[str]:
        """All queries already executed, to avoid repetition."""
        return {(r.query or "").lower().strip() for r in self.search_history}

    def get_open_hypotheses(self) -> list[Hypothesis]:
        """Hypotheses still under investigation."""
        return [h for h in self.hypotheses if h.status == "open"]

    def record_iteration_yield(self, new_entities: int, new_facts: int) -> None:
        """Record how many entities/facts were added this iteration (for diminishing returns)."""
        self.entities_added_per_iteration.append(new_entities)
        self.facts_added_per_iteration.append(new_facts)
        # Keep only last 10 to avoid unbounded growth
        if len(self.entities_added_per_iteration) > 10:
            self.entities_added_per_iteration = self.entities_added_per_iteration[-10:]
        if len(self.facts_added_per_iteration) > 10:
            self.facts_added_per_iteration = self.facts_added_per_iteration[-10:]
