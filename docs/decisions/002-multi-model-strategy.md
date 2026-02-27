# ADR 002: Multi-model strategy (Claude, GPT, Gemini)

## Status

Accepted.

## Context

No single LLM is best at every task. The PRD requires reasoning (planning), web-grounded search, structured extraction, risk analysis, and synthesis. Model strengths differ: Claude excels at long-context reasoning and nuanced judgment; GPT-4.1 at structured output and function calling; Gemini at web grounding.

## Decision

Use **three providers** with explicit task–model mapping:

| Task | Model | Rationale |
|------|--------|-----------|
| Research Director (planning, termination) | Claude Opus 4 | Multi-step reasoning, phase transitions, gap analysis |
| Fact extraction (NER, relations) | GPT-4.1 | Reliable JSON, schema adherence |
| Risk analysis, connection mapping, source verification, report | Claude Opus 4 | Nuanced risk and relationship reasoning, writing quality |
| Web search content summarization | (Tavily/Brave return raw content; optional Gemini for summarization if needed) | Gemini strong at web content; current design uses raw snippets |

Model selection is **explicit in agent code** (e.g. `self.provider = ModelProvider.CLAUDE`). The LLM client is provider-agnostic; swapping a model for a task is a config/agent change, not a pipeline rewrite.

### Failover and retry

- **Retry**: On transient errors (rate limit 429, 5xx, timeout), the LLM client retries up to 3 times with exponential backoff; only the same model is used for retries.
- **Fallback when provider missing**: If the requested provider is not in the configured set (e.g. missing API key or config), `get_model(provider)` returns another available provider so the run does not fail. Task-specific alternates (e.g. Director → GPT-4.1) are driven by tier resolution in `config/models.yaml`; swapping a model out is a config change and is tested via the tier resolution path.
- **Future**: Retry-once-then-switch-to-task-specific-fallback on 429/500 (e.g. after one transient failure, use the designated alternate for that task) is a possible enhancement; current behaviour is same-model retry plus fallback when the requested provider is unavailable.

## Consequences

- **Pros**: Best tool per task; clear reasoning for interviews; easy to A/B or cost-optimize per agent; retry and fallback keep runs resilient.
- **Cons**: Multiple API keys and failure modes; we mitigate with retry (transient only), budget enforcement, and fallback to any available model when a requested one is missing.
