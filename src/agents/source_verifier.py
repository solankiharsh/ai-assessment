"""
Source Verification Agent — cross-references claims and scores confidence.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import ResearchState
from src.prompts.templates import SOURCE_VERIFIER_SYSTEM, SOURCE_VERIFIER_USER_TEMPLATE

logger = structlog.get_logger()


class SourceVerificationAgent:
    """Cross-references claims and assigns calibrated confidence scores."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.FAST
        self.task = ModelTask.SOURCE_VERIFICATION

    async def verify_sources(self, state: ResearchState) -> ResearchState:
        if not state.entities:
            return state
        claims = []
        for entity in state.entities[:15]:
            for key, value in entity.attributes.items():
                claims.append(f"{entity.name}: {key} = {value}")
        for assoc in state.subject.known_associations[:10]:
            claims.append(assoc)
        if not claims:
            return state
        sources = list({url for record in state.search_history for url in record.result_urls})
        user_prompt = SOURCE_VERIFIER_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            claims="\n".join(f"- {c}" for c in claims[:20]),
            sources="\n".join(f"- {s}" for s in sources[:30]),
        )
        try:
            raw = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=SOURCE_VERIFIER_SYSTEM,
                user_prompt=user_prompt,
            )
            state.total_llm_calls += 1
            data = self._parse_json(raw)
            for vc in data.get("verified_claims", []):
                claim = vc.get("claim", "")
                conf = float(vc.get("confidence", 0.5))
                state.confidence_scores[claim[:100]] = conf
            if state.confidence_scores:
                scores = list(state.confidence_scores.values())
                state.overall_confidence = sum(scores) / len(scores)
            for contradiction in data.get("contradictions", []):
                state.error_log.append(f"CONTRADICTION: {contradiction.get('claim', 'unknown')}")
            logger.info(
                "source_verification_done",
                verified=len(data.get("verified_claims", [])),
                contradictions=len(data.get("contradictions", [])),
                overall_confidence=state.overall_confidence,
            )
        except Exception as e:
            logger.error("source_verification_error", error=str(e))
            state.error_log.append(f"Source verification: {e}")
        return state

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
            return {"verified_claims": [], "contradictions": []}
