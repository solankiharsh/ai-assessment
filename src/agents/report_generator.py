"""
Report Generation Agent — produces the final due diligence report.
Uses Claude for writing and synthesis.
"""

from __future__ import annotations

import json

import structlog

from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import ResearchState
from src.prompts.templates import (
    REPORT_GENERATOR_SYSTEM,
    REPORT_GENERATOR_USER_TEMPLATE,
)

logger = structlog.get_logger()


class ReportGenerator:
    """Generates the final investigation report."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.DEEP
        self.task = ModelTask.REPORT_SYNTHESIS

    async def generate_report(self, state: ResearchState) -> ResearchState:
        # Format timeline
        timeline_str = "(No temporal facts available)"
        if state.temporal_facts:
            lines = []
            for tf in state.temporal_facts:
                dr = tf.date_range if hasattr(tf, "date_range") else (None, None)
                start = dr[0] or "?"
                end = dr[1] or "present"
                lines.append(f"- [{tf.category}] {tf.claim} ({start} to {end}) [conf: {tf.confidence:.2f}]")
            timeline_str = "\n".join(lines)

        # Format temporal contradictions
        contradictions_str = "(No contradictions detected)"
        if state.temporal_contradictions:
            lines = []
            for tc in state.temporal_contradictions:
                lines.append(f"- [{tc.severity.value}] {tc.description} (conf: {tc.confidence:.2f})")
            contradictions_str = "\n".join(lines)

        # Format risk debate transcript
        debate_str = "(No debate transcript available)"
        if state.risk_debate_transcript:
            lines = []
            for entry in state.risk_debate_transcript:
                role = entry.get("role", "unknown")
                text = entry.get("argument", "")[:500]
                lines.append(f"[{role}]: {text}")
            debate_str = "\n\n".join(lines)

        # Format graph insights for report (discovery queries over identity graph)
        graph_insights_str = "(No graph insights available)"
        if getattr(state, "graph_insights", None):
            lines = []
            for insight in state.graph_insights:
                desc = insight.get("description", insight.get("type", "insight"))
                results = insight.get("results", insight.get("data", []))
                if isinstance(results, list):
                    lines.append(f"## {desc}")
                    for r in results[:15]:
                        lines.append(f"- {r}")
                else:
                    lines.append(f"## {desc}: {results}")
            if lines:
                graph_insights_str = "\n".join(lines)

        user_prompt = REPORT_GENERATOR_USER_TEMPLATE.format(
            subject_name=state.subject.full_name,
            subject_profile=json.dumps(state.subject.model_dump(), indent=2, default=str),
            entities=json.dumps([e.model_dump() for e in state.entities[:40]], indent=2, default=str),
            connections=json.dumps([c.model_dump() for c in state.connections[:30]], indent=2, default=str),
            risk_flags=json.dumps([f.model_dump() for f in state.risk_flags], indent=2, default=str),
            confidence_scores=json.dumps(state.confidence_scores, indent=2),
            total_searches=len(state.search_history),
            iterations=state.iteration,
            duration="N/A",
            cost=state.estimated_cost_usd,
            inaccessible_urls=json.dumps(state.inaccessible_urls, indent=2, default=str),
            timeline=timeline_str,
            temporal_contradictions=contradictions_str,
            risk_debate_transcript=debate_str,
            graph_insights=graph_insights_str,
        )
        try:
            report = await self.llm.generate_for_task(
                task=self.task,
                system_prompt=REPORT_GENERATOR_SYSTEM,
                user_prompt=user_prompt,
            )
            state.total_llm_calls += 1
            # Render through Jinja2 template for consistent structure
            try:
                from src.reports.renderer import TemplateRenderer
                renderer = TemplateRenderer()
                structured = renderer.render_report(state, llm_narrative=report)
                if structured.strip():
                    state.final_report = structured
                    logger.info("report_templated", length=len(structured))
                else:
                    state.final_report = report
                    logger.info("report_generated_raw", length=len(report))
            except Exception as e:
                state.final_report = report
                logger.debug("template_render_skipped", error=str(e))

            # Optional PII scan
            try:
                from src.pii import PIIRedactor
                redactor = PIIRedactor()
                annotations = redactor.scan_text(report)
                if annotations:
                    state.pii_annotations = [a.model_dump() for a in annotations]
                    state.redacted_report = redactor.redact_report(report, annotations)
                    logger.info("pii_scan_done", annotations_found=len(annotations))
            except Exception as e:
                logger.debug("pii_scan_skipped", error=str(e))
        except Exception as e:
            logger.error("report_generation_error", error=str(e))
            state.final_report = self._fallback_report(state)
        state.should_terminate = True
        return state

    def _fallback_report(self, state: ResearchState) -> str:
        lines = [
            f"# Due Diligence Report: {state.subject.full_name}",
            "\n## Subject Profile",
            f"- Name: {state.subject.full_name}",
            f"- Role: {state.subject.current_role}",
            f"- Organization: {state.subject.current_organization}",
            f"\n## Entities Discovered: {len(state.entities)}",
        ]
        for e in state.entities[:20]:
            lines.append(f"  - [{e.entity_type.value}] {e.name} (conf: {e.confidence:.2f})")
        lines.append(f"\n## Risk Flags: {len(state.risk_flags)}")
        for rf in state.risk_flags:
            lines.append(f"  - [{rf.severity.value}] {rf.title}")
        lines.append("\n## Investigation Stats")
        lines.append(f"  - Iterations: {state.iteration}")
        lines.append(f"  - Searches: {len(state.search_history)}")
        lines.append(f"  - LLM Calls: {state.total_llm_calls}")
        if state.inaccessible_urls:
            lines.append("\n## Sources identified but not retrievable")
            for entry in state.inaccessible_urls:
                url = entry.get("url", "?")
                reason = entry.get("reason", "?")
                lines.append(f"  - {url} ({reason})")
        return "\n".join(lines)
