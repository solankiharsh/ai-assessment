"""Observability: Prometheus metrics and optional OpenTelemetry for the Deep Research Agent."""

from src.observability.metrics import metrics, trace_span

__all__ = ["metrics", "trace_span"]
