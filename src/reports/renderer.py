"""
Jinja2-based report template renderer.

Provides consistent structure while allowing LLM-generated narrative
to fill analytical sections.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()

_TEMPLATES_DIR = Path(__file__).parent / "templates"


class TemplateRenderer:
    """Renders investigation reports using Jinja2 templates."""

    def __init__(self, templates_dir: Path | None = None) -> None:
        self._dir = templates_dir or _TEMPLATES_DIR
        self._env = None

    def _get_env(self) -> Any:
        """Lazy-init Jinja2 environment."""
        if self._env is None:
            try:
                from jinja2 import Environment, FileSystemLoader
                self._env = Environment(
                    loader=FileSystemLoader(str(self._dir)),
                    autoescape=False,  # noqa: S701 — markdown output, not HTML
                    trim_blocks=True,
                    lstrip_blocks=True,
                )
            except ImportError:
                logger.warning("jinja2_not_installed")
                return None
        return self._env

    def render(self, template_name: str, context: dict[str, Any]) -> str:
        """Render a template with the given context. Falls back to empty string if Jinja2 unavailable."""
        env = self._get_env()
        if env is None:
            return ""
        try:
            template = env.get_template(template_name)
            return template.render(**context)
        except Exception as e:
            logger.warning("template_render_error", template=template_name, error=str(e))
            return ""

    def render_report(self, state: Any, llm_narrative: str = "") -> str:
        """Render the default report template from a ResearchState."""
        context = self._build_context(state, llm_narrative)
        return self.render("default.md.j2", context)

    def render_executive_summary(self, state: Any, llm_narrative: str = "") -> str:
        """Render the executive summary template."""
        context = self._build_context(state, llm_narrative)
        return self.render("executive_summary.md.j2", context)

    def _build_context(self, state: Any, llm_narrative: str) -> dict[str, Any]:
        """Build template context from ResearchState."""
        # Pre-process connections to show names instead of IDs
        entity_map = {e.id: e.name for e in state.entities}
        resolved_connections = []
        for c in state.connections:
            # Create a dict if it hasn't been one, or modify copy
            c_dict = c.model_dump() if hasattr(c, "model_dump") else dict(c)
            c_dict["source_name"] = entity_map.get(c_dict.get("source_entity_id"), "Unknown Entity")
            c_dict["target_name"] = entity_map.get(c_dict.get("target_entity_id"), "Unknown Entity")
            # Normalize relationship_type for template (Jinja2 has no hasattr)
            rt = c_dict.get("relationship_type")
            c_dict["relationship_type_str"] = rt.value if hasattr(rt, "value") else (rt if isinstance(rt, str) else str(rt))
            resolved_connections.append(c_dict)

        return {
            "subject": state.subject,
            "entities": state.entities,
            "connections": resolved_connections,
            "risk_flags": state.risk_flags,
            "temporal_facts": getattr(state, "temporal_facts", []),
            "temporal_contradictions": getattr(state, "temporal_contradictions", []),
            "risk_debate_transcript": getattr(state, "risk_debate_transcript", []),
            "graph_insights": getattr(state, "graph_insights", []),
            "search_history": state.search_history,
            "confidence_scores": state.confidence_scores,
            "overall_confidence": state.overall_confidence,
            "inaccessible_urls": state.inaccessible_urls,
            "iteration": state.iteration,
            "estimated_cost_usd": state.estimated_cost_usd,
            "error_log": state.error_log,
            "llm_narrative": llm_narrative,
        }
