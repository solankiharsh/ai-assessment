# ADR 010: Model failover and retry

## Status

Accepted.

## Context

The design summary states that on 429/500/timeout the system retries once then falls back to a designated alternate model. This needs to be explicit in an ADR so the PRD question "what happens if we swap a model out?" has a testable answer.

## Decision

- **Retry**: On transient errors (rate limit 429, 5xx, timeout), the LLM client retries up to 3 times with exponential backoff; only the same model is used for retries.
- **Fallback when provider missing**: If the requested provider is not in the configured set (e.g. missing API key), `get_model(provider)` returns another available provider so the run does not fail. Task-specific alternates (e.g. Director → GPT-4.1) are driven by tier resolution in `config/models.yaml`.
- **Future**: Retry-once-then-switch-to-task-specific-fallback on 429/500 is a possible enhancement; current behaviour is same-model retry plus fallback when the requested provider is unavailable.

## Consequences

- **Pros**: Runs stay resilient; failover is documented and testable.
- **Cons**: Multiple API keys and failure modes; we mitigate with retry (transient only), budget enforcement, and fallback when the requested provider is missing.
