# ADR 004: Tavily + Brave dual search

## Status

Accepted.

## Context

Web search is the primary data source. Single-provider dependency risks rate limits, coverage gaps, and index bias. The PRD calls for triangulation (cross-referencing across sources).

## Decision

Use **Tavily as primary** and **Brave as fallback and triangulation**:

- **Primary**: Tavily (AI-optimized, returns snippets and optional raw content). One query → one Tavily call; if results are empty, we call Brave for the same query.
- **Triangulation**: In ADVERSARIAL and TRIANGULATION phases we set `use_both=True` and run Tavily and Brave in parallel; results are merged and deduplicated by URL.
- **Normalization**: Both providers return into a common `SearchResponse` / `NormalizedResult` so agents do not depend on which provider returned the hit.

## Consequences

- **Pros**: Resilience to one provider’s downtime/rate limits; different result sets improve coverage; triangulation supports the PRD’s verification phase.
- **Cons**: Two API keys; we accept the extra cost for robustness and quality.
