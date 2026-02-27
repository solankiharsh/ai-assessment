"""
Adversarial debate agents for risk analysis.

RiskProponentAgent argues that findings are concerning; RiskSkepticAgent argues
they are explainable or benign. Both use FAST tier. The risk analyzer acts as judge.
"""

from __future__ import annotations

import json

import structlog

from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import ResearchState
from src.prompts.templates import (
    RISK_PROPONENT_SYSTEM,
    RISK_PROPONENT_USER_TEMPLATE,
    RISK_SKEPTIC_SYSTEM,
    RISK_SKEPTIC_USER_TEMPLATE,
)

logger = structlog.get_logger()


class RiskProponentAgent:
    """Argues that discovered findings represent real, critical risks."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.FAST
        self.task = ModelTask.RISK_DEBATE

    async def argue(self, state: ResearchState) -> str:
        """Produce a short argument (plain text) for why findings are concerning."""
        if len(state.entities) < 2:
            return ""
        entities = json.dumps([e.model_dump() for e in state.entities[:30]], indent=2, default=str)
        connections = json.dumps([c.model_dump() for c in state.connections[:30]], indent=2, default=str)
        existing_flags = json.dumps([f.model_dump() for f in state.risk_flags], indent=2, default=str)
        user_prompt = RISK_PROPONENT_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            entities=entities,
            connections=connections,
            existing_flags=existing_flags,
        )
        try:
            return await self.llm.generate_for_task(
                task=self.task,
                system_prompt=RISK_PROPONENT_SYSTEM,
                user_prompt=user_prompt,
            )
        except Exception as e:
            logger.warning("risk_proponent_error", error=str(e))
            return ""


class RiskSkepticAgent:
    """Argues that findings are explainable, benign, or false positives."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.FAST
        self.task = ModelTask.RISK_DEBATE

    async def argue(self, state: ResearchState) -> str:
        """Produce a short argument (plain text) for why findings are benign or explainable."""
        if len(state.entities) < 2:
            return ""
        entities = json.dumps([e.model_dump() for e in state.entities[:30]], indent=2, default=str)
        connections = json.dumps([c.model_dump() for c in state.connections[:30]], indent=2, default=str)
        existing_flags = json.dumps([f.model_dump() for f in state.risk_flags], indent=2, default=str)
        user_prompt = RISK_SKEPTIC_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            entities=entities,
            connections=connections,
            existing_flags=existing_flags,
        )
        try:
            return await self.llm.generate_for_task(
                task=self.task,
                system_prompt=RISK_SKEPTIC_SYSTEM,
                user_prompt=user_prompt,
            )
        except Exception as e:
            logger.warning("risk_skeptic_error", error=str(e))
            return ""
