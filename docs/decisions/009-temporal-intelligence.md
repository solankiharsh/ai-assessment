# ADR 009: Temporal intelligence (timeline and contradiction detection)

## Status

Accepted.

## Context

Investigation output is inherently temporal: roles, filings, and claims have dates. A single classifier or search pass cannot reliably catch inconsistencies such as: the subject was at Company A in 2019 but an SEC filing places them at Company B in the same period; a company was dissolved before a deal allegedly closed; a licence expired before it was cited in marketing. We need timeline facts with date ranges and contradiction detection over the timeline.

## Decision

- **Timeline facts**: Every extracted fact is tagged with a temporal window (`date_range`, `as_of_date`). The pipeline builds a chronological timeline and runs contradiction detection over it.
- **Temporal analyzer**: `src/agents/temporal_analyzer.py`; `TemporalFact` / `TemporalContradiction` in state.
- **When**: One DEEP-tier LLM pass when there are enough entities; merges into existing temporal facts and flags contradictions with severity and confidence.

## Consequences

- **Pros**: Catches misrepresentation patterns (role vs suspension, AUM discrepancies, etc.) that keyword search would miss.
- **Cons**: One extra DEEP-tier LLM call when entities are sufficient.
