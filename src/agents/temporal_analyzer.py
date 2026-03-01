"""
Temporal Analysis Agent — extracts timeline facts and detects contradictions.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import (
    ResearchState,
    RiskCategory,
    RiskFlag,
    RiskSeverity,
    TemporalContradiction,
    TemporalFact,
)
from src.prompts.templates import (
    TEMPORAL_ANALYZER_SYSTEM,
    TEMPORAL_ANALYZER_USER_TEMPLATE,
)

logger = structlog.get_logger()


class TemporalAnalyzer:
    """Extracts temporal facts from entities/connections and detects contradictions."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.DEEP
        self.task = ModelTask.TEMPORAL_ANALYSIS

    async def analyze_timeline(self, state: ResearchState) -> ResearchState:
        """Extract temporal facts and detect contradictions."""
        if len(state.entities) < 2:
            logger.info("temporal_analysis_skipped", reason="insufficient entities")
            return state

        entities_str = json.dumps(
            [e.model_dump() for e in state.entities[:40]], indent=2, default=str
        )
        connections_str = json.dumps(
            [c.model_dump() for c in state.connections[:30]], indent=2, default=str
        )
        existing_str = json.dumps(
            [t.model_dump() for t in state.temporal_facts], indent=2, default=str
        ) if state.temporal_facts else "(None)"

        user_prompt = TEMPORAL_ANALYZER_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            entities=entities_str,
            connections=connections_str,
            existing_temporal_facts=existing_str,
        )

        try:
            raw = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=TEMPORAL_ANALYZER_SYSTEM,
                user_prompt=user_prompt,
            )
            state.total_llm_calls += 1
            self._parse_and_merge(state, raw)
        except Exception as e:
            logger.error("temporal_analysis_error", error=str(e))
            state.error_log.append(f"Temporal analysis: {e}")
        return state

    def _parse_and_merge(self, state: ResearchState, raw: str) -> None:
        """Parse temporal facts and contradictions from LLM output."""
        data = self._parse_json(raw)
        sev_map = {s.value: s for s in RiskSeverity}

        # Parse temporal facts
        for tf_raw in data.get("temporal_facts", []):
            date_range_raw = tf_raw.get("date_range", [None, None])
            if isinstance(date_range_raw, list) and len(date_range_raw) >= 2:
                dr: tuple[str | None, str | None] = (date_range_raw[0], date_range_raw[1])
            else:
                dr = (None, None)
            fact = TemporalFact(
                claim=tf_raw.get("claim", ""),
                entity_id=tf_raw.get("entity_id", ""),
                date_range=dr,
                as_of_date=tf_raw.get("as_of_date"),
                source_urls=tf_raw.get("source_urls", []),
                confidence=float(tf_raw.get("confidence", 0.5)),
                category=tf_raw.get("category", "event"),
            )
            state.temporal_facts.append(fact)

        # Parse contradictions and auto-generate risk flags (coerce IDs/description to str; LLM may return null or non-string)
        for tc_raw in data.get("contradictions", []):
            sev_str = (tc_raw.get("severity") or "medium").lower()
            contradiction = TemporalContradiction(
                fact_a_id=str(tc_raw.get("fact_a_id") or ""),
                fact_b_id=str(tc_raw.get("fact_b_id") or ""),
                description=str(tc_raw.get("description") or ""),
                severity=sev_map.get(sev_str, RiskSeverity.MEDIUM),
                confidence=float(tc_raw.get("confidence", 0.5)),
            )
            state.temporal_contradictions.append(contradiction)

            # Auto-generate risk flag for medium+ contradictions
            if contradiction.severity in (
                RiskSeverity.CRITICAL,
                RiskSeverity.HIGH,
                RiskSeverity.MEDIUM,
            ):
                flag = RiskFlag(
                    category=RiskCategory.INCONSISTENCY,
                    severity=contradiction.severity,
                    title=f"Temporal contradiction: {contradiction.description[:80]}",
                    description=contradiction.description,
                    confidence=contradiction.confidence,
                )
                state.risk_flags.append(flag)

        logger.info(
            "temporal_analysis_done",
            temporal_facts=len(state.temporal_facts),
            contradictions=len(state.temporal_contradictions),
        )

    def _parse_json(self, raw: str) -> dict[str, Any]:
        """Parse JSON from LLM output with cleanup."""
        cleaned = raw.strip()
        for prefix in ("```json", "```"):
            if prefix in cleaned:
                cleaned = cleaned.split(prefix)[1].split("```")[0]
                break
        start, end = cleaned.find("{"), cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            cleaned = cleaned[start:end]
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"temporal_facts": [], "contradictions": []}
