# ADR 008: Production Observability Stack — Grafana, Prometheus, OpenTelemetry

**Status**: Accepted
**Date**: 2026-02-27
**Context**: LangSmith provides LLM-specific tracing but isn't sufficient for production operations monitoring. A complete observability stack needs metrics, dashboards, alerting, and cross-system correlation.

---

## Decision

Implement a three-layer observability stack alongside LangSmith:

```
Layer 1: Instrumentation (OpenTelemetry + Prometheus metrics)
    → Every LLM call, search, fetch, and graph operation emits metrics + traces

Layer 2: Collection (Prometheus scraping + OTLP export)
    → Metrics scraped every 15s, traces exported to Jaeger/Tempo

Layer 3: Visualization & Alerting (Grafana dashboards + alert rules)
    → Real-time investigation monitoring, cost tracking, quality signals
```

### Why not just LangSmith?

| Need | LangSmith | Grafana + Prometheus |
|------|-----------|---------------------|
| LLM call tracing | ✅ Excellent | ⚠️ Possible but less detail |
| Prompt debugging | ✅ Purpose-built | ❌ Not suited |
| System-level metrics (latency, error rates, throughput) | ❌ Not available | ✅ Purpose-built |
| Cost tracking over time (trends, anomalies) | ⚠️ Per-run only | ✅ Time-series, alerting |
| Cross-investigation analytics | ❌ Single-run focus | ✅ Aggregate dashboards |
| Alerting (cost spike, quality degradation) | ❌ | ✅ Native alerting |
| Infrastructure correlation (memory, CPU, network) | ❌ | ✅ Full stack |
| Long-term retention and analysis | ⚠️ Limited | ✅ Configurable retention |

**They're complementary**: LangSmith for prompt-level debugging, Grafana for system-level operations. A lead runs both.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Deep Research Agent                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  OpenTelemetry Instrumentation Layer                  │    │
│  │                                                        │    │
│  │  @trace_span("director.plan")                         │    │
│  │  @track_metric("llm_call_duration_seconds")           │    │
│  │  @count_metric("search_queries_total")                │    │
│  └────────┬────────────────────────┬─────────────────────┘    │
│           │                        │                           │
│    ┌──────▼──────┐          ┌─────▼───────┐                  │
│    │ Prometheus   │          │ OTLP        │                  │
│    │ /metrics     │          │ Exporter    │                  │
│    │ endpoint     │          │ (traces)    │                  │
│    └──────┬──────┘          └─────┬───────┘                  │
└───────────┼────────────────────────┼──────────────────────────┘
            │                        │
     ┌──────▼──────┐          ┌─────▼───────┐
     │ Prometheus   │          │ Tempo /     │
     │ Server       │          │ Jaeger      │
     │ (scrape)     │          │ (traces)    │
     └──────┬──────┘          └─────┬───────┘
            │                        │
     ┌──────▼────────────────────────▼───────┐
     │              Grafana                    │
     │                                         │
     │  Dashboard 1: Investigation Monitor     │
     │  Dashboard 2: Cost & Budget Tracker     │
     │  Dashboard 3: Quality & Confidence      │
     │  Dashboard 4: Infrastructure Health     │
     │                                         │
     │  Alert: cost_per_run > $8               │
     │  Alert: error_rate > 15%                │
     │  Alert: avg_confidence < 0.4            │
     └─────────────────────────────────────────┘
```

---

## Metrics Taxonomy

### Investigation Metrics (Business)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `investigation_duration_seconds` | Histogram | `persona`, `status` | How long investigations take |
| `investigation_cost_usd` | Histogram | `persona`, `model` | Cost distribution |
| `investigation_entities_found` | Gauge | `persona` | Discovery depth |
| `investigation_risk_flags` | Gauge | `persona`, `severity` | Risk detection rate |
| `investigation_confidence_score` | Histogram | `persona` | Output quality signal |
| `investigation_depth_score` | Gauge | `persona`, `depth_level` | Depth-weighted evaluation |

### LLM Metrics (Operational)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `llm_call_duration_seconds` | Histogram | `model`, `task`, `provider` | Latency per model per task |
| `llm_call_tokens_total` | Counter | `model`, `task`, `direction` (in/out) | Token consumption |
| `llm_call_cost_usd` | Counter | `model`, `task` | Running cost |
| `llm_call_errors_total` | Counter | `model`, `task`, `error_type` | Failure tracking |
| `llm_call_fallback_total` | Counter | `primary_model`, `fallback_model` | Failover frequency |

### Search & Fetch Metrics (Operational)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `search_queries_total` | Counter | `provider`, `phase` | Search volume by provider |
| `search_results_total` | Counter | `provider`, `phase` | Result yield |
| `fetch_requests_total` | Counter | `domain`, `tier`, `status` | Fetch attempts by tier |
| `fetch_tier_escalation_total` | Counter | `domain`, `from_tier`, `to_tier` | How often fallback tiers activate |
| `fetch_duration_seconds` | Histogram | `domain`, `tier` | Fetch latency |

### Graph Metrics (Operational)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `graph_nodes_total` | Gauge | `label` | Graph size by entity type |
| `graph_edges_total` | Gauge | `relationship_type` | Relationship density |
| `graph_query_duration_seconds` | Histogram | `query_name` | Neo4j query performance |

---

## Grafana Dashboards

### Dashboard 1: Live Investigation Monitor
- Current phase (Baseline → Breadth → Depth → ...)
- Entity/connection count (real-time gauge)
- Search queries fired vs. results found (bar chart)
- Running cost (single stat with threshold coloring)
- Active model calls (timeline)
- Error log (last 10 errors)

### Dashboard 2: Cost & Budget Analytics
- Cost per investigation (histogram over time)
- Cost breakdown by model (stacked bar)
- Cost breakdown by task (Director vs Extraction vs Risk)
- Budget utilization % per run
- Projected monthly cost at current rate
- Cost anomaly alerts

### Dashboard 3: Quality & Confidence
- Average confidence score per investigation
- Depth-weighted recall by persona (gauge per depth level)
- Risk flags by severity (pie chart)
- False positive rate (if manual review data available)
- Confidence distribution (histogram)
- Source authority breakdown

### Dashboard 4: Infrastructure & Reliability
- LLM latency by provider (p50, p95, p99)
- Error rate by provider and error type
- Failover frequency
- Fetch success rate by domain
- Tier escalation heatmap (which domains need Playwright most)
- Search provider availability

---

## Alert Rules

```yaml
# grafana/provisioning/alerting/rules.yaml
groups:
  - name: deep_research_alerts
    rules:
      - alert: HighInvestigationCost
        expr: investigation_cost_usd > 8
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Investigation exceeded $8 budget"
          
      - alert: HighLLMErrorRate
        expr: rate(llm_call_errors_total[5m]) / rate(llm_call_duration_seconds_count[5m]) > 0.15
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "LLM error rate above 15%"
          
      - alert: LowConfidenceOutput
        expr: investigation_confidence_score < 0.4
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Investigation confidence below 0.4 — review findings"
          
      - alert: ProviderDown
        expr: rate(llm_call_errors_total{error_type="provider_unavailable"}[5m]) > 3
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.provider }} appears to be down"
          
      - alert: SearchExhaustion
        expr: rate(search_results_total[10m]) == 0 AND rate(search_queries_total[10m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Searches returning zero results — possible API issue or exhausted topic"
```

---

## Consequences

- **Pros**: Full production visibility; cost anomaly detection; quality monitoring over time; infrastructure correlation; alerting before problems become incidents; impressive demo artifact that no other candidate will have.
- **Cons**: Additional infra (Prometheus + Grafana + optional Tempo); ~200 lines of instrumentation code; docker-compose additions. Justified because the same stack would be used in production.