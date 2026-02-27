# Observability Guide (ADR 011)

The Deep Research Agent can expose **Prometheus metrics** and be monitored with **Grafana** when observability is enabled. This guide covers setup and usage.

## Quick start

1. **Start infrastructure**
   ```bash
   docker compose up -d neo4j prometheus grafana
   ```

2. **Enable metrics** (in `.env` or environment)
   ```bash
   PROMETHEUS_METRICS_ENABLED=true
   PROMETHEUS_METRICS_PORT=8000
   ```

3. **Run an investigation**
   ```bash
   python -m src.main investigate "Timothy Overturf" --role "CEO" --org "Sisu Capital" --live
   ```
   The agent exposes `/metrics` on port 8000 while the run is active. Prometheus (in Docker) scrapes `host.docker.internal:8000` every 5 seconds.

4. **Open Grafana**
   - URL: http://localhost:3001  
   - Login: `admin` / `research`  
   - Dashboard: http://localhost:3001/d/deep-research-monitor  

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMETHEUS_METRICS_ENABLED` | `false` | Set to `true` to expose `/metrics` and record metrics. |
| `PROMETHEUS_METRICS_PORT` | `8000` | Port for the metrics HTTP server. |
| `PROMETHEUS_PUSHGATEWAY_URL` | (empty) | Optional: push run summaries to a Pushgateway for history across runs. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (empty) | Optional: OTLP endpoint for trace export (e.g. Tempo/Jaeger). |

## Metrics taxonomy

- **Investigation**: `investigation_duration_seconds`, `investigation_cost_usd`, `investigation_entities_found`, `investigation_risk_flags`, `investigation_confidence_score`, `active_investigations`, `phase_duration_seconds`
- **LLM**: `llm_call_duration_seconds`, `llm_call_tokens_total`, `llm_call_cost_usd`, `llm_call_errors_total`, `llm_call_fallback_total`
- **Search**: `search_queries_total`, `search_results_total`
- **Fetch**: `fetch_requests_total`, `fetch_tier_escalation_total`, `fetch_duration_seconds`
- **Graph**: `graph_nodes_total`, `graph_edges_total`, `graph_query_duration_seconds`

See [ADR 011](decisions/011-observability-stack.md) for the full taxonomy and alert rules.

## Directory layout

```
monitoring/
  prometheus/
    prometheus.yml
  grafana/
    provisioning/
      datasources/prometheus.yml
      dashboards/dashboards.yml
      alerting/rules.yaml
    dashboards/
      investigation-monitor.json
  alerting/
    prometheus-rules.yaml
```

## Alert rules

Prometheus-style alert rules are in `monitoring/alerting/prometheus-rules.yaml` (HighLLMErrorRate, ProviderDown, SearchExhaustion). To use them, add `rule_files` to `monitoring/prometheus/prometheus.yml` or configure Grafana alerting to use the Prometheus datasource.

## Notes

- The agent process is **short-lived** (one investigation then exit). Metrics are only scraped while the run is active. For cost/quality history across runs, configure `PROMETHEUS_PUSHGATEWAY_URL` and push run summaries at the end of each investigation (see `push_run_summary` in `src/observability/metrics.py`).
- On Linux, `host.docker.internal` may not resolve; use the host’s IP or run the agent in the same Docker network as Prometheus.
