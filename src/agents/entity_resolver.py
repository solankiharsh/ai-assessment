"""
Entity Resolution Agent — deduplicates entities using fuzzy matching + LLM confirmation.

Step 1: rapidfuzz pre-filter to find candidate duplicate pairs.
Step 2: LLM confirmation of merge candidates.
Step 3: Merge entities and update connection references.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import Entity, ResearchState
from src.prompts.templates import (
    ENTITY_RESOLVER_SYSTEM,
    ENTITY_RESOLVER_USER_TEMPLATE,
)

logger = structlog.get_logger()


class EntityResolver:
    """Resolves duplicate entities through fuzzy matching and LLM confirmation."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.FAST
        self.task = ModelTask.ENTITY_RESOLUTION

    async def resolve(self, state: ResearchState) -> ResearchState:
        """Find and merge duplicate entities."""
        if len(state.entities) < 5:
            logger.info("entity_resolution_skipped", reason="too few entities")
            return state

        # Step 1: Find candidate pairs with rapidfuzz
        candidates = self._find_candidates(state.entities)
        if not candidates:
            logger.info("entity_resolution_no_candidates")
            return state

        # Step 2: LLM confirmation
        confirmed = await self._confirm_merges(state, candidates)
        if not confirmed:
            logger.info("entity_resolution_no_confirmed_merges")
            return state

        # Step 3: Merge
        merged_count = self._merge_entities(state, confirmed)
        logger.info("entity_resolution_done", candidates=len(candidates), merged=merged_count)
        return state

    def _find_candidates(self, entities: list[Entity], threshold: float = 0.75) -> list[dict[str, Any]]:
        """Use rapidfuzz to find candidate duplicate pairs."""
        try:
            from rapidfuzz import fuzz
        except ImportError:
            return []

        candidates = []
        for i, a in enumerate(entities):
            for b in entities[i + 1:]:
                if a.entity_type != b.entity_type:
                    continue
                score = fuzz.ratio(a.name.lower().strip(), b.name.lower().strip()) / 100.0
                if score >= threshold and score < 1.0:
                    candidates.append({
                        "entity_a_id": a.id,
                        "entity_a_name": a.name,
                        "entity_b_id": b.id,
                        "entity_b_name": b.name,
                        "similarity": round(score, 3),
                        "entity_type": a.entity_type.value,
                    })
        return candidates[:20]  # Limit to avoid huge LLM prompts

    async def _confirm_merges(
        self, state: ResearchState, candidates: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Use LLM to confirm which candidates should be merged."""
        user_prompt = ENTITY_RESOLVER_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            candidate_pairs=json.dumps(candidates, indent=2),
            all_entities=json.dumps(
                [{"id": e.id, "name": e.name, "type": e.entity_type.value, "aliases": e.aliases}
                 for e in state.entities[:40]],
                indent=2,
            ),
        )

        try:
            raw = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=ENTITY_RESOLVER_SYSTEM,
                user_prompt=user_prompt,
            )
            state.total_llm_calls += 1
            data = self._parse_json(raw)
            return [
                pair for pair in data.get("merge_pairs", [])
                if float(pair.get("confidence", 0)) >= 0.8
            ]
        except Exception as e:
            logger.error("entity_resolution_llm_error", error=str(e))
            return []

    def _merge_entities(self, state: ResearchState, confirmed: list[dict[str, Any]]) -> int:
        """Merge confirmed entity pairs and update connection references."""
        merged_count = 0
        entity_map: dict[str, str] = {}  # old_id -> new_id

        for pair in confirmed:
            a_id = pair.get("entity_a_id", "")
            b_id = pair.get("entity_b_id", "")
            a = state.get_entity_by_id(a_id)
            b = state.get_entity_by_id(b_id)
            if not a or not b:
                continue

            # Merge b into a (keep a as the surviving entity)
            a.aliases = list(set(a.aliases + b.aliases + [b.name]))
            a.source_urls = list(set(a.source_urls + b.source_urls))
            a.attributes.update(b.attributes)
            a.confidence = max(a.confidence, b.confidence)
            if b.description and not a.description:
                a.description = b.description

            entity_map[b.id] = a.id
            state.entities = [e for e in state.entities if e.id != b.id]
            merged_count += 1

        # Update connection references
        for conn in state.connections:
            if conn.source_entity_id in entity_map:
                conn.source_entity_id = entity_map[conn.source_entity_id]
            if conn.target_entity_id in entity_map:
                conn.target_entity_id = entity_map[conn.target_entity_id]

        return merged_count

    def _parse_json(self, raw: str) -> dict[str, Any]:
        """Parse JSON from LLM output."""
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
            return {"merge_pairs": []}
