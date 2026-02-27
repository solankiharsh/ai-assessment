"""
Connection Mapping Agent — traces relationships between entities.
Uses Claude for multi-hop reasoning about indirect relationships.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import Connection, Hypothesis, RelationshipType, ResearchState
from src.prompts.templates import (
    CONNECTION_MAPPER_SYSTEM,
    CONNECTION_MAPPER_USER_TEMPLATE,
)

logger = structlog.get_logger()


class ConnectionMappingAgent:
    """Maps relationships between entities, including non-obvious connections."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.DEEP
        self.task = ModelTask.CONNECTION_MAPPING

    async def map_connections(self, state: ResearchState) -> ResearchState:
        if len(state.entities) < 3:
            logger.info("connection_mapping_skipped", reason="too few entities")
            return state

        entities_str = json.dumps([e.model_dump() for e in state.entities[:30]], indent=2, default=str)
        findings = "\n".join(
            r.raw_snippets[0] if r.raw_snippets else f"Query: {r.query}" for r in state.search_history[-5:]
        )
        existing = json.dumps([c.model_dump() for c in state.connections[:20]], indent=2, default=str)
        user_prompt = CONNECTION_MAPPER_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            entities=entities_str,
            findings=findings[:4000],
            existing_connections=existing,
        )

        try:
            raw = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=CONNECTION_MAPPER_SYSTEM,
                user_prompt=user_prompt,
            )
            state.total_llm_calls += 1
            self._parse_and_merge(state, raw)
        except Exception as e:
            logger.error("connection_mapping_error", error=str(e))
            state.error_log.append(f"Connection mapping: {e}")
        return state

    def _parse_and_merge(self, state: ResearchState, raw: str) -> None:
        data = self._parse_json(raw)
        rel_map = {r.value: r for r in RelationshipType}
        new_count = 0
        for rc in data.get("connections", []):
            src = state.find_entity_by_name(rc.get("source", ""))
            tgt = state.find_entity_by_name(rc.get("target", ""))
            if not src or not tgt:
                continue
            rel_str = (rc.get("relationship") or "RELATED_TO").upper()
            rel = rel_map.get(rel_str, RelationshipType.RELATED_TO)
            conn = Connection(
                source_entity_id=src.id,
                target_entity_id=tgt.id,
                relationship_type=rel,
                description=rc.get("description", ""),
                confidence=float(rc.get("confidence", 0.5)),
                source_urls=rc.get("source_urls", []),
            )
            state.add_connection(conn)
            new_count += 1
        for insight in data.get("suggested_investigations", []):
            state.hypotheses.append(Hypothesis(description=insight, priority=7))
        logger.info("connection_mapping_done", new_connections=new_count)

    def _parse_json(self, raw: str) -> dict[str, Any]:
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
            return {"connections": [], "suggested_investigations": []}
