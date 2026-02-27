"""
Web Research Agent — executes search queries and collects raw content.

Takes the Research Director's search queries, runs them via Tavily/Brave,
fetches full page content when useful, and stores raw content in state
for downstream analysis agents.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

import structlog

from src.models import ResearchState, SearchPhase
from src.tools.search import SearchOrchestrator

logger = structlog.get_logger()


class WebResearchAgent:
    """Executes web searches and collects raw content for analysis."""

    def __init__(self, search: SearchOrchestrator) -> None:
        self.search = search

    async def execute_searches(
        self,
        state: ResearchState,
        queries: list[str],
        phase: SearchPhase,
        on_search: Callable[[str, str], None] | None = None,
    ) -> ResearchState:
        """Execute a batch of search queries and update state with results."""
        if not queries:
            logger.warning("web_research_no_queries")
            return state

        use_both = phase in (SearchPhase.TRIANGULATION, SearchPhase.ADVERSARIAL)
        phase_str = phase.value if hasattr(phase, "value") else str(phase)

        tasks = []
        for q in queries:
            if on_search:
                on_search(q, phase_str)
            tasks.append(
                self.search.search(
                    query=q,
                    phase=phase,
                    iteration=state.iteration,
                    use_both=use_both,
                )
            )
        results = await asyncio.gather(*tasks, return_exceptions=True)

        seen_urls: set[str] = set()
        new_content: list[dict[str, Any]] = []

        for result in results:
            if isinstance(result, Exception):
                logger.error("search_task_error", error=str(result))
                state.error_log.append(f"Search error: {result}")
                continue
            response, record = result
            state.search_history.append(record)
            state.total_search_calls += 1
            for item in response.results:
                if item.url in seen_urls:
                    continue
                seen_urls.add(item.url)
                content_entry = {
                    "url": item.url,
                    "title": item.title,
                    "snippet": item.snippet,
                    "domain": item.domain,
                    "raw_content": item.raw_content,
                    "query": response.query,
                }
                if not item.raw_content and phase != SearchPhase.BASELINE:
                    try:
                        fetch_result = await self.search.fetch_url(item.url)
                        if fetch_result.content:
                            content_entry["raw_content"] = fetch_result.content[:5000]
                        elif fetch_result.inaccessible_reason:
                            state.inaccessible_urls.append({
                                "url": item.url,
                                "reason": fetch_result.inaccessible_reason,
                                "query": response.query,
                                "phase": phase.value,
                            })
                    except Exception as e:
                        logger.debug("fetch_failed", url=item.url, error=str(e))
                        state.inaccessible_urls.append({
                            "url": item.url,
                            "reason": str(e)[:200],
                            "query": response.query,
                            "phase": phase.value,
                        })
                new_content.append(content_entry)
        state.pending_content.extend(new_content)
        logger.info(
            "web_research_complete",
            num_queries=len(queries),
            num_results=len(new_content),
            phase=phase.value,
        )
        return state
