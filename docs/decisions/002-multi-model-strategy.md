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

## Consequences

- **Pros**: Best tool per task; clear reasoning for interviews; easy to A/B or cost-optimize per agent.
- **Cons**: Multiple API keys and failure modes; we mitigate with retry (transient only), budget enforcement, and fallback to any available model when a requested one is missing.
