"""
LangGraph State Machine — core orchestration graph.

Research Director supervises and routes to specialized workers.
State is passed as dict; we serialize/deserialize ResearchState at each node.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from src.agents.connection_mapper import ConnectionMappingAgent
from src.agents.entity_resolver import EntityResolver
from src.agents.fact_extractor import FactExtractionAgent
from src.agents.report_generator import ReportGenerator
from src.agents.research_director import ResearchDirector
from src.agents.risk_analyzer import RiskAnalysisAgent
from src.agents.source_verifier import SourceVerificationAgent
from src.agents.temporal_analyzer import TemporalAnalyzer
from src.agents.web_researcher import WebResearchAgent
from src.config import get_settings
from src.graph_db.neo4j_client import Neo4jClient
from src.llm_client import LLMClient
from src.models import AgentAction, ResearchState, SubjectProfile
from src.run_metadata import RunMetadata
from src.tools.search import SearchOrchestrator

logger = structlog.get_logger()


def _subject_slug(name: str) -> str:
    """Slug from subject name; matches frontend subjectToSlug for progress file and stream route."""
    s = name.strip().lower()
    s = re.sub(r"\s+", "_", s)
    return re.sub(r"[^a-z0-9_]", "", s)


class ResearchGraph:
    """
    LangGraph-based research orchestration engine.
    Manages investigation from subject input to report and Neo4j persistence.
    """

    def __init__(
        self,
        budget_usd: float | None = None,
        debug: bool = False,
        output_dir: str = "outputs",
        on_progress: Callable[[str, dict], None] | None = None,
    ) -> None:
        settings = get_settings()
        budget = budget_usd if budget_usd is not None else settings.agent.cost_budget_usd
        self._debug = debug
        self._output_dir = output_dir
        self._on_progress = on_progress
        self._progress_path: Path | None = None  # Set at start of investigate() when subject known
        self._pipeline_debug_dir: Path | None = Path(output_dir) / "pipeline_debug" if debug else None
        self._pipeline_step = 0
        self.llm_client = LLMClient(budget_usd=budget)
        self.search = SearchOrchestrator()
        self.neo4j = Neo4jClient()

        self.director = ResearchDirector(self.llm_client)
        self.web_researcher = WebResearchAgent(self.search)
        self.fact_extractor = FactExtractionAgent(self.llm_client)
        self.risk_analyzer = RiskAnalysisAgent(self.llm_client)
        self.connection_mapper = ConnectionMappingAgent(self.llm_client)
        self.source_verifier = SourceVerificationAgent(self.llm_client)
        self.report_generator = ReportGenerator(self.llm_client)
        self.temporal_analyzer = TemporalAnalyzer(self.llm_client)
        self.entity_resolver = EntityResolver(self.llm_client)
        self._checkpointer = MemorySaver()

        self.graph = self._build_graph()

    def _build_graph(self) -> Any:
        """Construct the LangGraph state machine. State is dict (ResearchState.model_dump())."""
        graph = StateGraph(dict)

        graph.add_node("director", self._director_node)
        graph.add_node("web_research", self._web_research_node)
        graph.add_node("fact_extraction", self._fact_extraction_node)
        graph.add_node("risk_analysis", self._risk_analysis_node)
        graph.add_node("connection_mapping", self._connection_mapping_node)
        graph.add_node("source_verification", self._source_verification_node)
        graph.add_node("update_graph_db", self._update_graph_db_node)
        graph.add_node("generate_report", self._generate_report_node)
        graph.add_node("temporal_analysis", self._temporal_analysis_node)
        graph.add_node("entity_resolution", self._entity_resolution_node)

        graph.set_entry_point("director")
        graph.add_conditional_edges(
            "director",
            self._route_from_director,
            {
                "web_research": "web_research",
                "risk_analysis": "risk_analysis",
                "connection_mapping": "connection_mapping",
                "source_verification": "source_verification",
                "generate_report": "entity_resolution",
                "end": END,
            },
        )
        graph.add_edge("entity_resolution", "generate_report")
        graph.add_edge("web_research", "fact_extraction")
        graph.add_edge("fact_extraction", "director")
        graph.add_edge("risk_analysis", "director")
        graph.add_edge("connection_mapping", "director")
        graph.add_edge("source_verification", "director")
        graph.add_edge("generate_report", "temporal_analysis")
        graph.add_edge("temporal_analysis", "update_graph_db")
        graph.add_edge("update_graph_db", END)

        return graph.compile(checkpointer=self._checkpointer)

    def _write_stage_in(self, node_name: str, state_in: dict) -> None:
        if not self._pipeline_debug_dir:
            return
        self._pipeline_step += 1
        self._pipeline_debug_dir.mkdir(parents=True, exist_ok=True)
        (self._pipeline_debug_dir / f"step_{self._pipeline_step:03d}_{node_name}_in.json").write_text(
            json.dumps(state_in, indent=2, default=str), encoding="utf-8"
        )

    def _write_stage_out(self, node_name: str, state_out: dict) -> None:
        if not self._pipeline_debug_dir:
            return
        (self._pipeline_debug_dir / f"step_{self._pipeline_step:03d}_{node_name}_out.json").write_text(
            json.dumps(state_out, indent=2, default=str), encoding="utf-8"
        )

    def _emit_progress(self, event: dict) -> None:
        """Append one progress event (JSON line) to the progress file for SSE streaming."""
        if not self._progress_path:
            return
        try:
            payload = {**event, "ts": datetime.now(timezone.utc).isoformat()}
            with open(self._progress_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(payload, default=str) + "\n")
        except OSError as e:
            logger.debug("progress_file_write_error", path=str(self._progress_path), error=str(e))

    async def _director_node(self, state_dict: dict) -> dict:
        state = ResearchState(**state_dict)
        state.iteration += 1
        self._write_stage_in("director", state_dict)
        logger.info(
            "director_iteration",
            iteration=state.iteration,
            phase=state.current_phase.value,
            entities=len(state.entities),
        )
        decision = await self.director.plan_next_step(state)
        state.last_decision = decision
        state.current_phase = decision.current_phase
        # Track phases executed for run metadata
        phase = decision.current_phase
        phase_val = phase.value if hasattr(phase, "value") else str(phase)
        if not hasattr(state, "_phases_executed"):
            state._phases_executed = []  # type: ignore[attr-defined]
        if phase_val not in getattr(state, "_phases_executed", []):
            state._phases_executed.append(phase_val)  # type: ignore[attr-defined]
        if decision.next_action == AgentAction.TERMINATE:
            state.should_terminate = True
        if self._debug:
            slug = state.subject.full_name.replace(" ", "_").lower()
            snapshot_dir = Path(self._output_dir) / slug
            snapshot_dir.mkdir(parents=True, exist_ok=True)
            snapshot_path = snapshot_dir / f"iteration_{state.iteration}.json"
            snapshot_path.write_text(
                json.dumps(state.model_dump(), indent=2, default=str),
                encoding="utf-8",
            )
            logger.debug("debug_snapshot_written", path=str(snapshot_path))
        out = state.model_dump()
        if self._on_progress:
            self._on_progress("director", out)
        self._emit_progress(
            {"event": "node", "node": "director", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        self._write_stage_out("director", out)
        return out

    async def _web_research_node(self, state_dict: dict) -> dict:
        self._write_stage_in("web_research", state_dict)
        state = ResearchState(**state_dict)
        queries = state.last_decision.search_queries if state.last_decision else []
        if not queries:
            logger.warning("web_research_no_queries")
            return state.model_dump()
        def on_search(q: str, ph: str) -> None:
            self._emit_progress({"event": "search", "query": q, "phase": ph})

        state = await self.web_researcher.execute_searches(
            state=state, queries=queries, phase=state.current_phase, on_search=on_search
        )
        out = state.model_dump()
        self._write_stage_out("web_research", out)
        if self._on_progress:
            self._on_progress("web_research", out)
        self._emit_progress(
            {"event": "node", "node": "web_research", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    async def _fact_extraction_node(self, state_dict: dict) -> dict:
        self._write_stage_in("fact_extraction", state_dict)
        state = ResearchState(**state_dict)
        state = await self.fact_extractor.extract_facts(state)
        out = state.model_dump()
        self._write_stage_out("fact_extraction", out)
        if self._on_progress:
            self._on_progress("fact_extraction", out)
        self._emit_progress(
            {"event": "node", "node": "fact_extraction", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    async def _risk_analysis_node(self, state_dict: dict) -> dict:
        self._write_stage_in("risk_analysis", state_dict)
        state = ResearchState(**state_dict)
        state = await self.risk_analyzer.analyze_risks(state)
        out = state.model_dump()
        self._write_stage_out("risk_analysis", out)
        if self._on_progress:
            self._on_progress("risk_analysis", out)
        self._emit_progress(
            {"event": "node", "node": "risk_analysis", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    async def _connection_mapping_node(self, state_dict: dict) -> dict:
        self._write_stage_in("connection_mapping", state_dict)
        state = ResearchState(**state_dict)
        state = await self.connection_mapper.map_connections(state)
        out = state.model_dump()
        self._write_stage_out("connection_mapping", out)
        if self._on_progress:
            self._on_progress("connection_mapping", out)
        self._emit_progress(
            {"event": "node", "node": "connection_mapping", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    async def _source_verification_node(self, state_dict: dict) -> dict:
        self._write_stage_in("source_verification", state_dict)
        state = ResearchState(**state_dict)
        state = await self.source_verifier.verify_sources(state)
        out = state.model_dump()
        self._write_stage_out("source_verification", out)
        if self._on_progress:
            self._on_progress("source_verification", out)
        self._emit_progress(
            {"event": "node", "node": "source_verification", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    async def _update_graph_db_node(self, state_dict: dict) -> dict:
        self._write_stage_in("update_graph_db", state_dict)
        state = ResearchState(**state_dict)
        settings = get_settings()
        if settings.agent.enable_graph_db:
            try:
                await self.neo4j.connect()
                await self.neo4j.clear_graph()
                counts = await self.neo4j.persist_state(state)
                logger.info("graph_db_updated", **counts)
                # Auto-discovery queries
                try:
                    centrality = await self.neo4j.degree_centrality(top_n=10)
                    if centrality:
                        state.graph_insights.append({"type": "degree_centrality", "data": centrality})

                    # Shortest paths from subject to risk-flagged entities
                    risk_entity_names = set()
                    for flag in state.risk_flags:
                        for eid in flag.entity_ids:
                            entity = state.get_entity_by_id(eid)
                            if entity:
                                risk_entity_names.add(entity.name)
                    for name in list(risk_entity_names)[:5]:
                        paths = await self.neo4j.shortest_path(state.subject.full_name, name)
                        if paths:
                            state.graph_insights.append({
                                "type": "shortest_path",
                                "from": state.subject.full_name,
                                "to": name,
                                "data": paths,
                            })

                    shells = await self.neo4j.detect_shell_companies()
                    if shells:
                        state.graph_insights.append({"type": "shell_companies", "data": shells})
                except Exception as e:
                    logger.warning("graph_discovery_error", error=str(e))
            except Exception as e:
                logger.error("graph_db_error", error=str(e))
                state.error_log.append(f"Neo4j: {e}")
            finally:
                await self.neo4j.close()
        out = state.model_dump()
        self._write_stage_out("update_graph_db", out)
        if self._on_progress:
            self._on_progress("update_graph_db", out)
        self._emit_progress(
            {"event": "node", "node": "update_graph_db", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    async def _entity_resolution_node(self, state_dict: dict) -> dict:
        self._write_stage_in("entity_resolution", state_dict)
        state = ResearchState(**state_dict)
        # Only run entity resolution when entity count > 15
        if len(state.entities) > 15:
            state = await self.entity_resolver.resolve(state)
        else:
            logger.info("entity_resolution_skipped", reason="entity_count_below_threshold", count=len(state.entities))
        out = state.model_dump()
        self._write_stage_out("entity_resolution", out)
        if self._on_progress:
            self._on_progress("entity_resolution", out)
        self._emit_progress(
            {
                "event": "node", "node": "entity_resolution",
                "phase": out.get("current_phase"), "iteration": out.get("iteration"),
            }
        )
        return out

    async def _temporal_analysis_node(self, state_dict: dict) -> dict:
        self._write_stage_in("temporal_analysis", state_dict)
        state = ResearchState(**state_dict)
        state = await self.temporal_analyzer.analyze_timeline(state)
        out = state.model_dump()
        self._write_stage_out("temporal_analysis", out)
        if self._on_progress:
            self._on_progress("temporal_analysis", out)
        self._emit_progress(
            {
                "event": "node", "node": "temporal_analysis",
                "phase": out.get("current_phase"), "iteration": out.get("iteration"),
            }
        )
        return out

    async def _generate_report_node(self, state_dict: dict) -> dict:
        self._write_stage_in("generate_report", state_dict)
        state = ResearchState(**state_dict)
        state = await self.report_generator.generate_report(state)
        out = state.model_dump()
        self._write_stage_out("generate_report", out)
        if self._on_progress:
            self._on_progress("generate_report", out)
        self._emit_progress(
            {"event": "node", "node": "generate_report", "phase": out.get("current_phase"), "iteration": out.get("iteration")}
        )
        return out

    def _route_from_director(self, state_dict: dict) -> str:
        state = ResearchState(**state_dict)
        if state.should_terminate:
            return "end"
        if not state.last_decision:
            return "web_research"
        action = state.last_decision.next_action
        route_map = {
            AgentAction.SEARCH_WEB: "web_research",
            AgentAction.EXTRACT_FACTS: "web_research",
            AgentAction.ANALYZE_RISKS: "risk_analysis",
            AgentAction.MAP_CONNECTIONS: "connection_mapping",
            AgentAction.VERIFY_SOURCES: "source_verification",
            AgentAction.UPDATE_GRAPH: "web_research",
            AgentAction.GENERATE_REPORT: "generate_report",
            AgentAction.TERMINATE: "generate_report",
        }
        route = route_map.get(action, "web_research")
        logger.info("routing_decision", action=action.value, route=route)
        return route

    async def investigate(
        self,
        subject_name: str,
        current_role: str | None = None,
        current_org: str | None = None,
        max_iterations: int | None = None,
    ) -> ResearchState:
        """Run a full investigation; returns final ResearchState."""
        settings = get_settings()
        max_iter = max_iterations or settings.agent.max_search_iterations

        slug = _subject_slug(subject_name)
        if slug:
            self._progress_path = Path(self._output_dir) / f"{slug}_progress.jsonl"

        initial_state = ResearchState(
            subject=SubjectProfile(
                full_name=subject_name,
                current_role=current_role,
                current_organization=current_org,
            ),
            max_iterations=max_iter,
        )

        logger.info("investigation_started", subject=subject_name, max_iterations=max_iter)
        start_time = time.time()

        try:
            final_state_dict = await self.graph.ainvoke(
                initial_state.model_dump(),
                config={
                    "recursion_limit": max_iter * 10 + 20,
                    "configurable": {"thread_id": slug},
                },
            )
            final_state = ResearchState(**final_state_dict)
        except Exception as e:
            logger.error("investigation_error", error=str(e))
            # Try to recover last checkpoint state before falling back to empty initial_state
            recovered = False
            if self._checkpointer is not None:
                try:
                    checkpoint = self._checkpointer.get(
                        {"configurable": {"thread_id": slug}}
                    )
                    if checkpoint and checkpoint.get("channel_values"):
                        final_state = ResearchState(**checkpoint["channel_values"])
                        recovered = True
                        logger.info("recovered_from_checkpoint", entities=len(final_state.entities))
                except Exception:
                    pass
            if not recovered:
                final_state = initial_state
            final_state.error_log.append(f"Investigation failed: {e}")
            if not final_state.final_report or final_state.final_report.startswith("Investigation terminated"):
                final_state.final_report = f"Investigation terminated due to error: {e}"

        final_state.estimated_cost_usd = self.llm_client.total_cost
        duration = round(time.time() - start_time, 1)
        logger.info(
            "investigation_complete",
            subject=subject_name,
            duration_seconds=duration,
            entities=len(final_state.entities),
            connections=len(final_state.connections),
            risk_flags=len(final_state.risk_flags),
            iterations=final_state.iteration,
            llm_calls=final_state.total_llm_calls,
            search_calls=final_state.total_search_calls,
            estimated_cost=round(final_state.estimated_cost_usd, 4),
        )

        # Build and save run metadata
        termination = "completed"
        if final_state.error_log:
            termination = "error"
        elif final_state.should_terminate:
            termination = "terminated_by_director"

        metadata = RunMetadata(
            run_id=slug,
            subject=subject_name,
            started_at=datetime.fromtimestamp(start_time, tz=timezone.utc),
            completed_at=datetime.now(timezone.utc),
            duration_seconds=duration,
            total_cost_usd=final_state.estimated_cost_usd,
            iterations=final_state.iteration,
            phases_executed=getattr(final_state, "_phases_executed", []),
            entities_found=len(final_state.entities),
            connections_found=len(final_state.connections),
            risk_flags_count=len(final_state.risk_flags),
            sources_accessed=len(final_state.search_history),
            sources_failed=len(final_state.inaccessible_urls),
            termination_reason=termination,
            error_count=len(final_state.error_log),
        )
        try:
            out_path = Path(self._output_dir)
            out_path.mkdir(parents=True, exist_ok=True)
            meta_path = out_path / f"{slug}_metadata.json"
            meta_path.write_text(
                json.dumps(metadata.model_dump(), indent=2, default=str),
                encoding="utf-8",
            )
            logger.info("run_metadata_saved", path=str(meta_path))
        except Exception as e:
            logger.warning("run_metadata_save_error", error=str(e))

        return final_state

    async def resume(self, thread_id: str) -> ResearchState:
        """Resume a checkpointed investigation by thread_id."""
        logger.info("investigation_resuming", thread_id=thread_id)
        try:
            final_state_dict = await self.graph.ainvoke(
                None,
                config={
                    "recursion_limit": 32,
                    "configurable": {"thread_id": thread_id},
                },
            )
            return ResearchState(**final_state_dict)
        except Exception as e:
            logger.error("resume_error", error=str(e))
            raise

    async def cleanup(self) -> None:
        await self.search.close()
        await self.neo4j.close()
