"""
Risk Pattern Agent — flags potential risks, inconsistencies, and concerns.
Runs adversarial debate (proponent + skeptic) then acts as judge. Uses Claude for nuanced risk reasoning.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog

from src.agents.risk_debate import RiskProponentAgent, RiskSkepticAgent
from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import ResearchState, RiskCategory, RiskFlag, RiskSeverity
from src.prompts.templates import RISK_ANALYZER_SYSTEM, RISK_ANALYZER_USER_TEMPLATE

logger = structlog.get_logger()


class RiskAnalysisAgent:
    """Analyzes investigation findings for risk patterns and red flags."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.DEEP
        self.task = ModelTask.RISK_JUDGE
        self._proponent = RiskProponentAgent(llm_client)
        self._skeptic = RiskSkepticAgent(llm_client)

    async def analyze_risks(self, state: ResearchState) -> ResearchState:
        if len(state.entities) < 2:
            logger.info("risk_analysis_skipped", reason="insufficient entities")
            return state

        proponent_arg, skeptic_arg = await asyncio.gather(
            self._proponent.argue(state),
            self._skeptic.argue(state),
        )
        if proponent_arg:
            state.total_llm_calls += 1
        if skeptic_arg:
            state.total_llm_calls += 1
        proponent_arg = proponent_arg or "(No proponent argument available.)"
        skeptic_arg = skeptic_arg or "(No skeptic argument available.)"

        # Preserve debate transcript
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat()
        state.risk_debate_transcript.append(
            {"role": "proponent", "argument": proponent_arg, "timestamp": ts}
        )
        state.risk_debate_transcript.append(
            {"role": "skeptic", "argument": skeptic_arg, "timestamp": ts}
        )

        subject_profile = json.dumps(state.subject.model_dump(), indent=2, default=str)
        entities = json.dumps([e.model_dump() for e in state.entities[:30]], indent=2, default=str)
        connections = json.dumps([c.model_dump() for c in state.connections[:30]], indent=2, default=str)
        existing_flags = json.dumps([f.model_dump() for f in state.risk_flags], indent=2, default=str)
        recent_adversarial_searches = self._format_recent_adversarial_searches(state)
        user_prompt = RISK_ANALYZER_USER_TEMPLATE.format(
            subject_profile=subject_profile,
            entities=entities,
            connections=connections,
            existing_flags=existing_flags,
            recent_adversarial_searches=recent_adversarial_searches,
            proponent_argument=proponent_arg,
            skeptic_argument=skeptic_arg,
        )

        try:
            raw = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=RISK_ANALYZER_SYSTEM,
                user_prompt=user_prompt,
            )
            state.total_llm_calls += 1
            
            data = self._parse_json(raw)
            # Prioritize narrative fields for the transcript
            judge_narrative = (
                data.get("summary") or 
                data.get("overall_risk_assessment") or 
                self._extract_narrative_from_raw(raw)
            )
            
            self._parse_and_merge(state, raw)
            # Preserve judge output in transcript
            state.risk_debate_transcript.append(
                {"role": "judge", "argument": judge_narrative, "timestamp": ts}
            )
        except Exception as e:
            logger.error("risk_analysis_error", error=str(e))
            state.error_log.append(f"Risk analysis: {e}")
        return state

    def _format_recent_adversarial_searches(self, state: ResearchState) -> str:
        """Format last N adversarial search records for the risk analyzer context."""
        adversarial = [
            r for r in (state.search_history or [])
            if getattr(r.phase, "value", str(r.phase)) == "adversarial"
        ]
        recent = adversarial[-20:] if len(adversarial) > 20 else adversarial
        if not recent:
            return "(No adversarial searches recorded yet.)"
        lines = []
        for r in recent:
            useful = "yes" if getattr(r, "was_useful", True) else "no"
            lines.append(f"Query: {r.query}\nOutcome: {r.num_results} results. Useful: {useful}")
        return "\n\n".join(lines)

    def _parse_and_merge(self, state: ResearchState, raw: str) -> None:
        data = self._parse_json(raw)
        cat_map = {c.value: c for c in RiskCategory}
        sev_map = {s.value: s for s in RiskSeverity}
        before = len(state.risk_flags)
        for rf in data.get("risk_flags", []):
            title = rf.get("title", "")
            if any(existing.title.lower() == title.lower() for existing in state.risk_flags):
                continue
            cat_str = (rf.get("category") or "").lower()
            sev_str = (rf.get("severity") or "").lower()
            flag = RiskFlag(
                category=cat_map.get(cat_str, RiskCategory.REPUTATIONAL),
                severity=sev_map.get(sev_str, RiskSeverity.MEDIUM),
                title=title,
                description=rf.get("description", ""),
                evidence=rf.get("evidence", []),
                entity_ids=rf.get("entity_ids", []),
                confidence=float(rf.get("confidence", 0.5)),
                mitigating_factors=rf.get("mitigating_factors", []),
            )
            state.risk_flags.append(flag)
        flags_added = len(state.risk_flags) - before
        logger.info(
            "risk_analysis_done",
            total_flags=len(state.risk_flags),
            flags_added=flags_added,
        )

    def _extract_narrative_from_raw(self, raw: str) -> str:
        """Extract narrative part of judge output by removing JSON blocks."""
        cleaned = raw.strip()
        # Remove JSON blocks
        if "```json" in cleaned:
            parts = cleaned.split("```json")
            # Take everything before the first JSON block or after the last one
            cleaned = parts[0].strip() or parts[-1].split("```")[-1].strip()
        
        # If still empty or looks like JSON, just take first 1000 chars and hope for the best
        if not cleaned or (cleaned.startswith("{") and cleaned.endswith("}")):
            return "Narrative assessment included in structured flags."
            
        return cleaned[:1000]

    def _parse_json(self, raw: str) -> dict[str, Any]:
        """Utility to safely extract JSON from LLM markdown blocks."""
        cleaned = raw.strip()
        for prefix in ("```json", "```"):
            if prefix in cleaned:
                try:
                    parts = cleaned.split(prefix)
                    if len(parts) > 1:
                        content = parts[1].split("```")[0]
                        if content.strip():
                            cleaned = content.strip()
                            break
                except Exception:
                    continue
        
        start, end = cleaned.find("{"), cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            cleaned = cleaned[start:end]
            
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"risk_flags": []}
