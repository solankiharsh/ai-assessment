"""
Evaluation metrics — measures agent performance against ground truth.

Computes:
  - Recall: % of expected facts discovered
  - Entity recall: % of expected entities found
  - Connection recall: % of expected connections mapped
  - Risk flag counts
  - Operational metrics (iterations, cost, LLM calls)
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from src.evaluation.eval_set import TestPersona
from src.models import ResearchState

logger = structlog.get_logger()


@dataclass
class EvaluationResult:
    """Results of evaluating an investigation against ground truth."""

    persona_name: str
    difficulty: str

    expected_facts: int
    discovered_facts: int
    fact_recall: float
    matched_facts: list[str]
    missed_facts: list[str]

    expected_entities: int
    discovered_entities: int
    entity_recall: float
    matched_entities: list[str]
    missed_entities: list[str]

    expected_connections: int
    discovered_connections: int
    connection_recall: float

    expected_risk_flags: int
    discovered_risk_flags: int

    total_iterations: int
    total_searches: int
    total_llm_calls: int
    estimated_cost: float
    overall_confidence: float

    # Depth-weighted evaluation (1=surface, 5=deeply hidden)
    weighted_score: float = 0.0
    depth_breakdown: dict[str, dict[str, float | int]] = field(default_factory=dict)

    def summary(self) -> str:
        """Human-readable summary."""
        depth_section = ""
        if self.depth_breakdown:
            depth_section = (
                f"Weighted Score:    {self.weighted_score:.2f}\n"
                + "".join(
                    f"  Depth {d} recall: {self.depth_breakdown.get(f'depth_{d}', {}).get('recall', 0):.1%}\n"
                    for d in range(1, 6)
                    if f"depth_{d}" in self.depth_breakdown
                )
            )
        return (
            f"=== Evaluation: {self.persona_name} ({self.difficulty}) ===\n"
            f"Fact Recall:       {self.fact_recall:.1%} ({self.discovered_facts}/{self.expected_facts})\n"
            + depth_section
            + f"Entity Recall:     {self.entity_recall:.1%} ({self.discovered_entities}/{self.expected_entities})\n"
            f"Connection Recall: {self.connection_recall:.1%} "
            f"({self.discovered_connections}/{self.expected_connections})\n"
            f"Risk Flags Found:  {self.discovered_risk_flags}\n"
            f"Overall Confidence: {self.overall_confidence:.2f}\n"
            f"Iterations:        {self.total_iterations}\n"
            f"Searches:          {self.total_searches}\n"
            f"LLM Calls:         {self.total_llm_calls}\n"
            f"Est. Cost:         ${self.estimated_cost:.4f}\n"
            "\nMatched Facts:\n"
            + "\n".join(f"  ✓ {f}" for f in self.matched_facts)
            + "\nMissed Facts:\n"
            + "\n".join(f"  ✗ {f}" for f in self.missed_facts)
            + "\nMatched Entities:\n"
            + "\n".join(f"  ✓ {e}" for e in self.matched_entities)
            + "\nMissed Entities:\n"
            + "\n".join(f"  ✗ {e}" for e in self.missed_entities)
        )


def evaluate(state: ResearchState, persona: TestPersona) -> EvaluationResult:
    """
    Evaluate an investigation result against a ground truth persona.

    Uses fuzzy matching for facts and entities since exact string matches
    are too brittle for natural language extraction.
    """
    all_discovered_text = " ".join(
        [
            state.subject.summary or "",
            " ".join(state.subject.known_associations),
            " ".join(e.name + " " + e.description + " " + str(e.attributes) for e in state.entities),
            " ".join(c.description for c in state.connections),
            state.final_report or "",
        ]
    ).lower()

    matched_facts = []
    missed_facts = []
    # Track per-fact match for depth-weighted score
    fact_matched_by_depth: dict[int, list[bool]] = {d: [] for d in range(1, 6)}

    for ef in persona.expected_facts:
        key_terms = (
            [k.lower() for k in ef.search_keywords]
            if ef.search_keywords
            else [t.lower() for t in ef.claim.split() if len(t) > 3]
        )
        match_ratio = sum(1 for t in key_terms if t in all_discovered_text) / max(len(key_terms), 1)
        if match_ratio >= 0.5:
            matched_facts.append(ef.claim)
            fact_matched_by_depth[ef.effective_depth()].append(True)
        else:
            missed_facts.append(ef.claim)
            fact_matched_by_depth[ef.effective_depth()].append(False)

    expected_fact_count = len(persona.expected_facts)
    fact_recall = len(matched_facts) / max(expected_fact_count, 1)

    # Depth-weighted score: weight = depth/5, score = sum(weight * found) / total_weight
    total_weight = 0.0
    weighted_sum = 0.0
    for ef in persona.expected_facts:
        d = ef.effective_depth()
        w = d / 5.0
        total_weight += w
        if ef.claim in matched_facts:
            weighted_sum += w
    weighted_score = weighted_sum / total_weight if total_weight > 0 else 0.0

    # Depth breakdown: recall per depth level
    depth_breakdown: dict[str, dict[str, float | int]] = {}
    for d in range(1, 6):
        outcomes = fact_matched_by_depth.get(d, [])
        if not outcomes:
            continue
        found = sum(1 for x in outcomes if x)
        depth_breakdown[f"depth_{d}"] = {
            "found": found,
            "total": len(outcomes),
            "recall": found / len(outcomes),
        }

    discovered_entity_names = {e.name.lower() for e in state.entities}
    discovered_entity_names.update(alias.lower() for e in state.entities for alias in e.aliases)

    matched_entities = []
    missed_entities = []
    for expected in persona.expected_entities:
        if any(expected.lower() in name for name in discovered_entity_names):
            matched_entities.append(expected)
        else:
            missed_entities.append(expected)

    entity_recall = len(matched_entities) / max(len(persona.expected_entities), 1)

    connection_matches = 0
    for src_name, tgt_name, _rel in persona.expected_connections:
        src = state.find_entity_by_name(src_name)
        tgt = state.find_entity_by_name(tgt_name)
        if src and tgt:
            for conn in state.connections:
                if conn.source_entity_id == src.id and conn.target_entity_id == tgt.id:
                    connection_matches += 1
                    break

    connection_recall = connection_matches / max(len(persona.expected_connections), 1)

    result = EvaluationResult(
        persona_name=persona.name,
        difficulty=persona.difficulty,
        expected_facts=expected_fact_count,
        discovered_facts=len(matched_facts),
        fact_recall=fact_recall,
        matched_facts=matched_facts,
        missed_facts=missed_facts,
        expected_entities=len(persona.expected_entities),
        discovered_entities=len(matched_entities),
        entity_recall=entity_recall,
        matched_entities=matched_entities,
        missed_entities=missed_entities,
        expected_connections=len(persona.expected_connections),
        discovered_connections=connection_matches,
        connection_recall=connection_recall,
        expected_risk_flags=len(persona.expected_risk_flags),
        discovered_risk_flags=len(state.risk_flags),
        total_iterations=state.iteration,
        total_searches=len(state.search_history),
        total_llm_calls=state.total_llm_calls,
        estimated_cost=state.estimated_cost_usd,
        overall_confidence=state.overall_confidence,
        weighted_score=weighted_score,
        depth_breakdown=depth_breakdown,
    )

    logger.info(
        "evaluation_complete",
        persona=persona.name,
        fact_recall=fact_recall,
        entity_recall=entity_recall,
    )

    return result
