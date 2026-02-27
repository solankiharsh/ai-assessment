"""
Prometheus metrics and optional OpenTelemetry for the Deep Research Agent.

All metrics are no-op when observability.metrics_enabled is False.
Exposes track_llm_call, record_llm_*, track_search, record_fetch, record_tier_escalation,
track_graph_query, record_graph_stats, investigation_started/completed, track_phase, start_server.
"""

from __future__ import annotations

import contextlib
import threading
import time
from typing import Any

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    start_http_server as prometheus_start_http_server,
)


def _enabled() -> bool:
    try:
        from src.config import get_settings
        return bool(get_settings().observability.metrics_enabled)
    except Exception:
        return False


def _safe_labels(**kwargs: str) -> dict[str, str]:
    """Return label dict with empty string for missing; Prometheus labels must be strings."""
    return {k: (v or "" if v is not None else "") for k, v in kwargs.items()}


# Lazy registry: only create metrics when enabled and first used
_metrics_created = False


def _ensure_metrics() -> bool:
    global _metrics_created
    if _metrics_created or not _enabled():
        return _metrics_created
    _create_metrics()
    _metrics_created = True
    return True


def _create_metrics() -> None:
    """Create all Prometheus metrics (called once when enabled)."""
    # Investigation (business)
    _investigation_duration = Histogram(
        "investigation_duration_seconds",
        "Investigation duration in seconds",
        ["persona", "status"],
        buckets=[10, 30, 60, 120, 300],
    )
    _investigation_cost = Histogram(
        "investigation_cost_usd",
        "Investigation cost in USD",
        ["persona", "status"],
        buckets=[0.5, 1, 2, 5, 8, 15],
    )
    _investigation_entities = Gauge(
        "investigation_entities_found",
        "Number of entities found per investigation",
        ["persona"],
    )
    _investigation_risk_flags = Gauge(
        "investigation_risk_flags",
        "Risk flags count by severity",
        ["persona", "severity"],
    )
    _investigation_confidence = Histogram(
        "investigation_confidence_score",
        "Overall confidence score per investigation",
        ["persona"],
        buckets=[0.2, 0.4, 0.6, 0.8, 1.0],
    )
    _active_investigations = Gauge(
        "active_investigations",
        "Number of investigations currently running",
        [],
    )
    _phase_duration = Histogram(
        "phase_duration_seconds",
        "Duration per phase",
        ["phase", "from_phase"],
        buckets=[1, 5, 15, 30, 60],
    )

    # LLM (operational)
    _llm_duration = Histogram(
        "llm_call_duration_seconds",
        "LLM call latency",
        ["model", "task", "provider"],
        buckets=[0.5, 1, 2, 5, 10, 30],
    )
    _llm_tokens = Counter(
        "llm_call_tokens_total",
        "Tokens consumed",
        ["model", "task", "direction"],
    )
    _llm_cost = Counter(
        "llm_call_cost_usd",
        "Cost per call in USD",
        ["model", "task"],
    )
    _llm_errors = Counter(
        "llm_call_errors_total",
        "LLM call errors",
        ["model", "task", "error_type"],
    )
    _llm_fallback = Counter(
        "llm_call_fallback_total",
        "Fallback to alternate model",
        ["primary_model", "fallback_model", "task"],
    )

    # Search
    _search_queries = Counter(
        "search_queries_total",
        "Search queries executed",
        ["provider", "phase"],
    )
    _search_results = Counter(
        "search_results_total",
        "Search results returned",
        ["provider", "phase"],
    )

    # Fetch
    _fetch_requests = Counter(
        "fetch_requests_total",
        "Fetch attempts by tier",
        ["domain", "tier", "status"],
    )
    _fetch_escalation = Counter(
        "fetch_tier_escalation_total",
        "Tier escalation count",
        ["domain", "from_tier", "to_tier"],
    )
    _fetch_duration = Histogram(
        "fetch_duration_seconds",
        "Fetch latency by tier",
        ["domain", "tier"],
        buckets=[0.5, 1, 2, 5, 10],
    )
    _fetch_dead_domains = Counter(
        "fetch_dead_domains_total",
        "URLs where domain DNS resolution failed, by recovery method",
        ["domain", "recovery_method"],
    )

    # Graph
    _graph_nodes = Gauge(
        "graph_nodes_total",
        "Node count by label",
        ["label"],
    )
    _graph_edges = Gauge(
        "graph_edges_total",
        "Edge count by relationship type",
        ["relationship_type"],
    )
    _graph_query_duration = Histogram(
        "graph_query_duration_seconds",
        "Neo4j query duration",
        ["query_name"],
        buckets=[0.1, 0.5, 1, 2, 5],
    )

    # Store on module for access from MetricsCollector
    _registry = {
        "investigation_duration": _investigation_duration,
        "investigation_cost": _investigation_cost,
        "investigation_entities": _investigation_entities,
        "investigation_risk_flags": _investigation_risk_flags,
        "investigation_confidence": _investigation_confidence,
        "active_investigations": _active_investigations,
        "phase_duration": _phase_duration,
        "llm_duration": _llm_duration,
        "llm_tokens": _llm_tokens,
        "llm_cost": _llm_cost,
        "llm_errors": _llm_errors,
        "llm_fallback": _llm_fallback,
        "search_queries": _search_queries,
        "search_results": _search_results,
        "fetch_requests": _fetch_requests,
        "fetch_escalation": _fetch_escalation,
        "fetch_duration": _fetch_duration,
        "fetch_dead_domains": _fetch_dead_domains,
        "graph_nodes": _graph_nodes,
        "graph_edges": _graph_edges,
        "graph_query_duration": _graph_query_duration,
    }
    setattr(_MetricsCollector, "_registry", _registry)


class _MetricsCollector:
    """Collector that delegates to Prometheus when enabled, no-op otherwise."""

    _registry: dict[str, Any] = {}

    def _get(self, name: str) -> Any:
        _ensure_metrics()
        return self._registry.get(name)

    # --- LLM ---
    @contextlib.asynccontextmanager
    async def track_llm_call(self, model: str = "", task: str = "", provider: str = ""):
        m = self._get("llm_duration")
        start = time.perf_counter()
        exc_type = None
        try:
            yield
        except Exception as e:
            exc_type = type(e).__name__
            err = self._get("llm_errors")
            if err:
                err.labels(
                    model=model or "unknown",
                    task=task or "unknown",
                    error_type=exc_type,
                ).inc()
            raise
        finally:
            if m:
                m.labels(
                    model=model or "unknown",
                    task=task or "unknown",
                    provider=provider or "unknown",
                ).observe(time.perf_counter() - start)

    def record_llm_fallback(
        self,
        primary: str,
        fallback: str,
        task: str = "",
    ) -> None:
        c = self._get("llm_fallback")
        if c:
            c.labels(
                primary_model=primary or "unknown",
                fallback_model=fallback or "unknown",
                task=task or "unknown",
            ).inc()

    def record_llm_tokens(
        self,
        model: str = "",
        task: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        t = self._get("llm_tokens")
        if t:
            t.labels(model=model or "unknown", task=task or "unknown", direction="input").inc(input_tokens)
            t.labels(model=model or "unknown", task=task or "unknown", direction="output").inc(output_tokens)

    def record_llm_cost(self, model: str = "", task: str = "", cost_usd: float = 0.0) -> None:
        c = self._get("llm_cost")
        if c and cost_usd > 0:
            c.labels(model=model or "unknown", task=task or "unknown").inc(cost_usd)

    # --- Search ---
    @contextlib.asynccontextmanager
    async def track_search(self, provider: str = "", phase: str = ""):
        class Tracker:
            def __init__(self, parent: _MetricsCollector, provider: str, phase: str):
                self._parent = parent
                self._provider = provider or "unknown"
                self._phase = phase or "unknown"
                self._results = 0

            def set_results(self, n: int) -> None:
                self._results = n

            def _finish(self) -> None:
                q = self._parent._get("search_queries")
                r = self._parent._get("search_results")
                if q:
                    q.labels(provider=self._provider, phase=self._phase).inc()
                if r:
                    r.labels(provider=self._provider, phase=self._phase).inc(self._results)

        tracker = Tracker(self, provider, phase)
        try:
            yield tracker
        finally:
            tracker._finish()

    # --- Fetch ---
    def record_fetch(
        self,
        domain: str,
        tier: int,
        status_code: str,
        duration: float,
    ) -> None:
        status = str(status_code) if status_code else "unknown"
        domain = (domain or "unknown")[:64]
        req = self._get("fetch_requests")
        dur = self._get("fetch_duration")
        if req:
            req.labels(domain=domain, tier=str(tier), status=status).inc()
        if dur:
            dur.labels(domain=domain, tier=str(tier)).observe(duration)

    def record_tier_escalation(
        self,
        domain: str,
        from_tier: int,
        to_tier: int,
    ) -> None:
        c = self._get("fetch_escalation")
        if c:
            c.labels(
                domain=(domain or "unknown")[:64],
                from_tier=str(from_tier),
                to_tier=str(to_tier),
            ).inc()

    def record_dead_domain(
        self,
        domain: str,
        recovery_method: str = "unrecoverable",
    ) -> None:
        """Increment dead-domain counter. recovery_method: attempt/wayback/relocated/unrecoverable."""
        c = self._get("fetch_dead_domains")
        if c:
            c.labels(
                domain=(domain or "unknown")[:64],
                recovery_method=(recovery_method or "unknown")[:32],
            ).inc()

    # --- Graph ---
    @contextlib.contextmanager
    def track_graph_query(self, query_name: str):
        h = self._get("graph_query_duration")
        start = time.perf_counter()
        try:
            yield
        finally:
            if h:
                h.labels(query_name=query_name or "unknown").observe(time.perf_counter() - start)

    def record_graph_stats(
        self,
        node_counts_by_label: dict[str, int],
        edge_counts_by_type: dict[str, int],
    ) -> None:
        gn = self._get("graph_nodes")
        ge = self._get("graph_edges")
        if gn:
            for label, count in (node_counts_by_label or {}).items():
                gn.labels(label=(label or "Entity")[:64]).set(count)
        if ge:
            for rel, count in (edge_counts_by_type or {}).items():
                ge.labels(relationship_type=(rel or "RELATED_TO")[:64]).set(count)

    # --- Investigation ---
    def investigation_started(self, investigation_id: str = "", persona: str = "") -> None:
        g = self._get("active_investigations")
        if g:
            g.inc()

    def investigation_completed(
        self,
        investigation_id: str = "",
        persona: str = "",
        status: str = "complete",
        cost_usd: float = 0.0,
        entity_count: int = 0,
        risk_flags: dict[str, int] | None = None,
        confidence: float = 0.0,
        duration_seconds: float = 0.0,
    ) -> None:
        g = self._get("active_investigations")
        if g:
            g.dec()
        persona = persona or "default"
        status = status or "complete"
        d = self._get("investigation_duration")
        c = self._get("investigation_cost")
        e = self._get("investigation_entities")
        conf = self._get("investigation_confidence")
        rf = self._get("investigation_risk_flags")
        if d and duration_seconds >= 0:
            d.labels(persona=persona, status=status).observe(duration_seconds)
        if c and cost_usd >= 0:
            c.labels(persona=persona, status=status).observe(cost_usd)
        if e:
            e.labels(persona=persona).set(entity_count)
        if conf and confidence >= 0:
            conf.labels(persona=persona).observe(confidence)
        if rf and risk_flags:
            for sev, count in risk_flags.items():
                rf.labels(persona=persona, severity=(sev or "unknown")[:32]).set(count)

    @contextlib.contextmanager
    def track_phase(self, phase: str, from_phase: str = ""):
        h = self._get("phase_duration")
        start = time.perf_counter()
        try:
            yield
        finally:
            if h:
                h.labels(
                    phase=(phase or "unknown")[:32],
                    from_phase=(from_phase or "")[:32],
                ).observe(time.perf_counter() - start)

    def start_server(self, port: int = 8000) -> None:
        if not _enabled():
            return
        _ensure_metrics()

        def run() -> None:
            try:
                prometheus_start_http_server(port, addr="0.0.0.0")
            except Exception:
                pass

        t = threading.Thread(target=run, daemon=True)
        t.start()


metrics = _MetricsCollector()


def trace_span(name: str, **kwargs: Any) -> contextlib.AbstractContextManager[Any]:
    """Optional OpenTelemetry span; no-op for now (metrics-only implementation)."""
    return contextlib.nullcontext()
