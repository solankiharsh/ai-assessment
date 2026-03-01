"""
Multi-model LLM client with unified interface.

Provides a clean abstraction over Claude, GPT, and Gemini so that agent code
doesn't couple to any specific provider. Model routing is explicit: each agent
declares which model it needs, and this module handles the plumbing.

Design decisions:
  - Structured output via Pydantic model binding where supported
  - Automatic cost tracking and budget enforcement per investigation
  - Retry only on transient errors (rate limit, 5xx, network)
  - LangSmith tracing is automatic when LANGCHAIN_TRACING_V2=true
"""

from __future__ import annotations

import json
import os
from enum import Enum
from typing import Optional, TypeVar
from urllib.parse import urlparse

import structlog
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.config import get_settings
from src.observability import metrics as obs_metrics

logger = structlog.get_logger()
T = TypeVar("T", bound=BaseModel)


# ── Error taxonomy: retry only transient, fail fast on permanent ──


class LLMClientError(Exception):
    """Base for LLM client errors."""

    pass


class TransientError(LLMClientError):
    """Rate limit, 5xx, timeout, connection — safe to retry."""

    pass


class PermanentError(LLMClientError):
    """Invalid API key, bad request, malformed response — do not retry."""

    pass


class BudgetExhaustedError(LLMClientError):
    """Cost budget for this investigation exceeded; terminate gracefully."""

    pass


def _classify_error(exc: BaseException) -> type[LLMClientError]:
    """Classify exception as Transient or Permanent for retry policy."""
    msg = str(exc).lower()
    if "rate" in msg or "429" in msg or "503" in msg or "500" in msg:
        return TransientError
    if "timeout" in msg or "connection" in msg or "reset" in msg:
        return TransientError
    if "401" in msg or "403" in msg or "invalid" in msg or "api key" in msg:
        return PermanentError
    if "expired" in msg or "400" in msg or "malformed" in msg or "schema" in msg:
        return PermanentError
    # Default: treat unknown as transient (retry a few times)
    return TransientError


class ModelProvider(str, Enum):
    """Available LLM providers."""

    CLAUDE = "claude"
    OPENAI = "openai"
    GEMINI = "gemini"


class ModelTier(str, Enum):
    """Cost tier: DEEP for complex reasoning, FAST for routine tasks."""

    DEEP = "deep"
    FAST = "fast"


class ModelTask(str, Enum):
    """Per-role model task identifiers for fine-grained routing."""

    RESEARCH_DIRECTOR = "research_director"
    FACT_EXTRACTION = "fact_extraction"
    RISK_DEBATE = "risk_debate"
    RISK_JUDGE = "risk_judge"
    REPORT_SYNTHESIS = "report_synthesis"
    ENTITY_RESOLUTION = "entity_resolution"
    TEMPORAL_ANALYSIS = "temporal_analysis"
    SOURCE_VERIFICATION = "source_verification"
    CONNECTION_MAPPING = "connection_mapping"


# ── Approximate cost per 1K tokens (input/output) ──
COST_PER_1K = {
    ModelProvider.CLAUDE: {"input": 0.003, "output": 0.015},
    ModelProvider.OPENAI: {"input": 0.002, "output": 0.008},
    ModelProvider.GEMINI: {"input": 0.00125, "output": 0.005},
}


_LENGTH_LIMIT_PHRASES = (
    "length limit was reached",
    "finish_reason: length",
    "max_tokens",
    "context_length_exceeded",
    "maximum context length",
    "Could not parse response content",  # LangChain wraps truncated json_object responses
)

# Model name substrings that identify reasoning / thinking models.
# These models: (a) burn tokens internally for reasoning/thinking, so need a
# higher max_tokens budget; (b) do not support response_format=json_object.
_REASONING_MODEL_PATTERNS = (
    "o1", "o3", "o4",           # OpenAI o-series
    "gemini-2.5",               # Gemini 2.5 series (thinking enabled by default)
    "deepseek-r",               # DeepSeek-R reasoning series
    "qwen-qwq", "qwq",          # Qwen QwQ reasoning models
)

# Token budget for reasoning models: they spend hundreds-to-thousands of tokens
# internally, so the effective output budget needs to be much larger.
_REASONING_MODEL_MAX_TOKENS = 16000


def _is_length_limit_error(exc: BaseException) -> bool:
    """Return True when exc indicates the model hit its output token limit."""
    msg = str(exc).lower()
    return any(phrase.lower() in msg for phrase in _LENGTH_LIMIT_PHRASES)


def _model_name_from(model: object) -> str:
    """Best-effort extraction of the model name string from a LangChain model object."""
    for attr in ("model", "model_name", "model_id"):
        val = getattr(model, attr, None)
        if isinstance(val, str) and val:
            return val
    return ""


def _is_reasoning_model(model: object) -> bool:
    """Return True if the model is a reasoning/thinking model that should not use json_mode."""
    name = _model_name_from(model).lower()
    return any(pat in name for pat in _REASONING_MODEL_PATTERNS)


def _estimate_cost(provider: ModelProvider, input_len: int, output_len: int) -> float:
    """Estimate cost for a call (chars → rough tokens)."""
    costs = COST_PER_1K.get(provider, {"input": 0.002, "output": 0.008})
    inp = input_len / 4
    out = output_len / 4
    return (inp / 1000 * costs["input"]) + (out / 1000 * costs["output"])


class LLMClient:
    """
    Unified LLM client supporting Claude, OpenAI, and Gemini.

    - Budget: if cost_budget_usd > 0, raises BudgetExhaustedError when exceeded.
    - Retries only TransientError (rate limit, 5xx, timeouts).
    """

    def __init__(self, budget_usd: Optional[float] = None) -> None:
        settings = get_settings()
        # Do not write API keys to os.environ so no code path can read a stale key; we pass keys only to model constructors.

        self._models: dict[ModelProvider, BaseChatModel] = {}
        self._fast_models: dict[ModelProvider, BaseChatModel] = {}
        self._total_cost: float = 0.0
        self._budget_usd: float = budget_usd if budget_usd is not None else settings.agent.cost_budget_usd

        # Models are created lazily in _ensure_models() on first get_model() so the key at request time is current

        use_litellm = bool(settings.llm.litellm_api_key and settings.llm.litellm_api_key.strip())
        key_suffix: dict[str, str] = {}
        if use_litellm:
            key_suffix["litellm"] = f"...{settings.llm.litellm_api_key.strip()[-4:]}"
        else:
            if settings.llm.anthropic_api_key:
                key_suffix["claude"] = f"...{settings.llm.anthropic_api_key[-4:]}"
            if settings.llm.openai_api_key:
                key_suffix["openai"] = f"...{settings.llm.openai_api_key[-4:]}"
            if settings.llm.google_api_key:
                key_suffix["gemini"] = f"...{settings.llm.google_api_key[-4:]}"
        logger.info(
            "llm_client_initialized",
            budget_usd=self._budget_usd,
            use_litellm=use_litellm,
            key_suffix=key_suffix,
            models_created_on_first_use=True,
        )

    def _ensure_models(self) -> None:
        """Create model instances on first use with current get_settings() so the key at request time is correct."""
        if self._models:
            return
        get_settings.cache_clear()
        settings = get_settings()
        # Unset API key env vars so nothing in this process can use a stale key; we pass keys only to constructors below.
        for _k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "LITELLM_API_KEY"):
            os.environ.pop(_k, None)

        use_litellm = bool(settings.llm.litellm_api_key and settings.llm.litellm_api_key.strip())
        base_url = (settings.llm.litellm_api_base or "").strip() or "http://localhost:4000"
        api_key = (settings.llm.litellm_api_key or "").strip()

        def _is_localhost(url: str) -> bool:
            if not url or not url.strip():
                return True
            try:
                host = (urlparse(url).hostname or "").lower()
                return host in ("localhost", "127.0.0.1", "::1")
            except Exception:
                return True

        # In deployed environments (e.g. Railway), localhost is not reachable. Only use
        # LiteLLM when base URL is explicitly set to a non-localhost endpoint.
        if use_litellm and api_key and _is_localhost(base_url):
            structlog.get_logger().warning(
                "litellm_skipped_localhost",
                base_url=base_url,
                msg="LITELLM_API_BASE is localhost or unset; using direct provider keys if set.",
            )
            use_litellm = False

        if use_litellm and api_key:
            # All models via LiteLLM proxy (OpenAI-compatible). Proxy routes by model name.
            def _litellm_client(model: str) -> BaseChatModel:
                return ChatOpenAI(
                    base_url=base_url.rstrip("/"),
                    api_key=api_key,
                    model=model,
                    temperature=settings.llm.temperature,
                    max_tokens=settings.llm.max_tokens,
                )

            self._models[ModelProvider.CLAUDE] = _litellm_client(settings.llm.claude_model)
            self._fast_models[ModelProvider.CLAUDE] = _litellm_client(settings.llm.claude_fast_model)
            self._models[ModelProvider.OPENAI] = _litellm_client(settings.llm.openai_model)
            self._fast_models[ModelProvider.OPENAI] = _litellm_client(settings.llm.openai_fast_model)
            self._models[ModelProvider.GEMINI] = _litellm_client(settings.llm.gemini_model)
            self._fast_models[ModelProvider.GEMINI] = _litellm_client(settings.llm.gemini_fast_model)
            return
        # Direct provider API keys
        if settings.llm.anthropic_api_key:
            self._models[ModelProvider.CLAUDE] = ChatAnthropic(
                model=settings.llm.claude_model,
                api_key=settings.llm.anthropic_api_key,
                temperature=settings.llm.temperature,
                max_tokens=settings.llm.max_tokens,
            )
            self._fast_models[ModelProvider.CLAUDE] = ChatAnthropic(
                model=settings.llm.claude_fast_model,
                api_key=settings.llm.anthropic_api_key,
                temperature=settings.llm.temperature,
                max_tokens=settings.llm.max_tokens,
            )
        if settings.llm.openai_api_key:
            self._models[ModelProvider.OPENAI] = ChatOpenAI(
                model=settings.llm.openai_model,
                api_key=settings.llm.openai_api_key,
                temperature=settings.llm.temperature,
                max_tokens=settings.llm.max_tokens,
            )
            self._fast_models[ModelProvider.OPENAI] = ChatOpenAI(
                model=settings.llm.openai_fast_model,
                api_key=settings.llm.openai_api_key,
                temperature=settings.llm.temperature,
                max_tokens=settings.llm.max_tokens,
            )
        if settings.llm.google_api_key:
            self._models[ModelProvider.GEMINI] = ChatGoogleGenerativeAI(
                model=settings.llm.gemini_model,
                google_api_key=settings.llm.google_api_key,
                temperature=settings.llm.temperature,
                max_output_tokens=settings.llm.max_tokens,
            )
            self._fast_models[ModelProvider.GEMINI] = ChatGoogleGenerativeAI(
                model=settings.llm.gemini_fast_model,
                google_api_key=settings.llm.google_api_key,
                temperature=settings.llm.temperature,
                max_output_tokens=settings.llm.max_tokens,
            )

    def resolve_tier(self, tier: ModelTier) -> ModelProvider:
        """Return the best available provider for the given tier."""
        self._ensure_models()
        if tier == ModelTier.DEEP:
            for p in (ModelProvider.CLAUDE, ModelProvider.OPENAI, ModelProvider.GEMINI):
                if p in self._models:
                    return p
        else:
            for p in (ModelProvider.OPENAI, ModelProvider.GEMINI, ModelProvider.CLAUDE):
                if p in self._fast_models:
                    return p
        if self._models:
            return next(iter(self._models))
        raise PermanentError(f"No LLM models available. Requested tier: {tier}")

    def _fallback_provider_for_tier(self, tier: ModelTier, primary: ModelProvider) -> Optional[ModelProvider]:
        """Return the designated fallback provider for a tier when primary fails.

        Fallback routing:
          DEEP  → Claude (primary) → OpenAI (GPT-4.1)
          FAST  → OpenAI (GPT-4.1-mini, primary) → Gemini (Gemini 2.5 Flash)
        """
        self._ensure_models()
        if tier == ModelTier.DEEP:
            order = (ModelProvider.CLAUDE, ModelProvider.OPENAI, ModelProvider.GEMINI)
            model_dict = self._models
        else:
            order = (ModelProvider.OPENAI, ModelProvider.GEMINI, ModelProvider.CLAUDE)
            model_dict = self._fast_models
        # Return the next configured provider after primary in the order
        found_primary = False
        for p in order:
            if p == primary:
                found_primary = True
                continue
            if found_primary and p in model_dict:
                return p
        return None

    def get_model_by_tier(self, tier: ModelTier) -> BaseChatModel:
        """Get the LangChain model for the given tier (uses fast or deep model)."""
        provider = self.resolve_tier(tier)
        if tier == ModelTier.FAST and provider in self._fast_models:
            return self._fast_models[provider]
        return self.get_model(provider)

    def get_model(self, provider: ModelProvider) -> BaseChatModel:
        """Get the LangChain model instance for a provider."""
        self._ensure_models()
        if provider not in self._models:
            if self._models:
                fallback = next(iter(self._models))
                logger.warning("model_fallback", requested=provider, using=fallback)
                obs_metrics.record_llm_fallback(
                    primary=provider.value,
                    fallback=fallback.value,
                    task="unknown",
                )
                return self._models[fallback]
            raise PermanentError(f"No LLM models available. Requested: {provider}")
        return self._models[provider]

    def _check_budget(self, provider: ModelProvider, input_len: int) -> None:
        """Raise BudgetExhaustedError if estimated cost would exceed budget."""
        if self._budget_usd <= 0:
            return
        # Estimate next call (assume 2k output tokens)
        next_cost = _estimate_cost(provider, input_len, 8000)
        if self._total_cost + next_cost > self._budget_usd:
            raise BudgetExhaustedError(
                f"Cost budget ${self._budget_usd:.2f} exceeded "
                f"(current ${self._total_cost:.4f}, next ~${next_cost:.4f})"
            )

    def _wrap_transient(self, exc: BaseException) -> None:
        """Re-raise as TransientError or PermanentError for retry policy."""
        if isinstance(exc, (TransientError, PermanentError, BudgetExhaustedError)):
            raise exc
        if _classify_error(exc) is TransientError:
            raise TransientError(str(exc)) from exc
        raise PermanentError(str(exc)) from exc

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(TransientError),
        before_sleep=lambda rs: logger.warning(
            "llm_retry",
            attempt=rs.attempt_number,
            error=str(rs.outcome.exception()) if rs.outcome else "unknown",
        ),
    )
    async def generate(
        self,
        provider: ModelProvider,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
    ) -> str:
        """
        Generate a text response from the specified model.

        Raises:
            BudgetExhaustedError: if cost would exceed configured budget.
            PermanentError: invalid key, bad request (no retry).
            TransientError: rate limit / 5xx (retried up to 3 times).
        """
        combined = system_prompt + user_prompt
        self._check_budget(provider, len(combined))

        model = self.get_model(provider)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        if temperature is not None and hasattr(model, "temperature"):
            model = model.bind(temperature=temperature)

        try:
            response = await model.ainvoke(messages)
        except Exception as e:
            self._wrap_transient(e)
            raise

        content = response.content if hasattr(response, "content") else str(response)
        self._track_cost(provider, combined, content)
        return content

    async def generate_for_tier(
        self,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        json_mode: bool = False,
        task: str = "",
    ) -> str:
        """Generate using the model for the given tier (DEEP or FAST).

        Attempts the primary provider first, then switches to the designated
        fallback provider on TransientError (rate limit, 429, timeout):
          DEEP  tier: Claude → OpenAI (GPT-4.1)
          FAST  tier: OpenAI (GPT-4.1-mini) → Gemini (Gemini 2.5 Flash)

        Args:
            json_mode: When True, request JSON-object response format from the
                model (OpenAI / LiteLLM).  Eliminates markdown fences and
                trailing-comma issues at the source.  Silently ignored for
                providers that do not support the feature.
            task: Task name for metrics (e.g. from ModelTask.value).
        """
        primary_provider = self.resolve_tier(tier)
        combined = system_prompt + user_prompt
        self._check_budget(primary_provider, len(combined))

        try:
            return await self._generate_for_provider(
                provider=primary_provider,
                tier=tier,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                combined=combined,
                temperature=temperature,
                json_mode=json_mode,
                task=task,
                is_fallback=False,
            )
        except TransientError as primary_err:
            # Primary provider failed with a transient error — try designated fallback
            fallback_provider = self._fallback_provider_for_tier(tier, primary_provider)
            if fallback_provider is None:
                raise  # No configured fallback — propagate original error

            primary_model = self.get_model_by_tier(tier)
            primary_model_name = _model_name_from(primary_model)

            # Determine fallback model name for logging
            if tier == ModelTier.FAST and fallback_provider in self._fast_models:
                fb_model = self._fast_models[fallback_provider]
            elif fallback_provider in self._models:
                fb_model = self._models[fallback_provider]
            else:
                raise
            fallback_model_name = _model_name_from(fb_model)

            err_str = str(primary_err)
            err_code = "429" if "429" in err_str else ("timeout" if "timeout" in err_str.lower() else "transient")
            logger.warning(
                "llm_fallback_triggered",
                tier=tier.value,
                primary_provider=primary_provider.value,
                primary_model=primary_model_name,
                fallback_provider=fallback_provider.value,
                fallback_model=fallback_model_name,
                error_code=err_code,
                error=err_str[:120],
                task=task or "unknown",
            )
            obs_metrics.record_llm_fallback(
                primary=primary_provider.value,
                fallback=fallback_provider.value,
                task=task or "unknown",
            )
            self._check_budget(fallback_provider, len(combined))
            return await self._generate_for_provider(
                provider=fallback_provider,
                tier=tier,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                combined=combined,
                temperature=temperature,
                json_mode=json_mode,
                task=task,
                is_fallback=True,
            )

    async def _generate_for_provider(
        self,
        provider: ModelProvider,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        combined: str,
        temperature: Optional[float],
        json_mode: bool,
        task: str,
        is_fallback: bool = False,
    ) -> str:
        """Internal: run a single LLM call for a specific provider+tier, with json_mode and metrics."""
        if tier == ModelTier.FAST and provider in self._fast_models:
            model = self._fast_models[provider]
        elif provider in self._models:
            model = self._models[provider]
        else:
            model = self.get_model(provider)

        model_name = _model_name_from(model)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        reasoning = _is_reasoning_model(model)
        bindings: dict = {}
        if temperature is not None:
            bindings["temperature"] = temperature
        if json_mode and not reasoning:
            bindings["response_format"] = {"type": "json_object"}
        if reasoning:
            bindings["max_tokens"] = _REASONING_MODEL_MAX_TOKENS
        if bindings and hasattr(model, "bind"):
            try:
                model = model.bind(**bindings)
            except Exception:
                if temperature is not None and hasattr(model, "bind"):
                    try:
                        model = model.bind(temperature=temperature)
                    except Exception:
                        pass

        async with obs_metrics.track_llm_call(
            model=model_name,
            task=task or "unknown",
            provider=provider.value,
        ):
            try:
                response = await model.ainvoke(messages)
            except Exception as e:
                if json_mode and _is_length_limit_error(e):
                    logger.warning(
                        "json_mode_length_limit_fallback",
                        tier=tier.value,
                        provider=provider.value,
                        error=str(e)[:120],
                    )
                    if tier == ModelTier.FAST and provider in self._fast_models:
                        plain_model = self._fast_models[provider]
                    else:
                        plain_model = self._models.get(provider, model)
                    if temperature is not None and hasattr(plain_model, "bind"):
                        plain_model = plain_model.bind(temperature=temperature)
                    try:
                        response = await plain_model.ainvoke(messages)
                    except Exception as e2:
                        self._wrap_transient(e2)
                        raise
                else:
                    self._wrap_transient(e)
                    raise

        content = response.content if hasattr(response, "content") else str(response)
        self._track_cost(provider, combined, content)
        input_tokens = len(combined) // 4
        output_tokens = len(str(content)) // 4
        cost = _estimate_cost(provider, len(combined), len(str(content)))
        obs_metrics.record_llm_tokens(
            model=model_name,
            task=task or "unknown",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        obs_metrics.record_llm_cost(
            model=model_name,
            task=task or "unknown",
            cost_usd=cost,
        )
        return content

    def _resolve_task_tier(self, task: ModelTask) -> ModelTier:
        """Resolve the tier for a specific task from YAML config, with fallback."""
        settings = get_settings()
        tasks_cfg = settings.model_routing.get("tasks", {})
        task_cfg = tasks_cfg.get(task.value, {})
        tier_str = task_cfg.get("tier", "")
        if tier_str == "deep":
            return ModelTier.DEEP
        if tier_str == "fast":
            return ModelTier.FAST
        # Default tier mapping
        deep_tasks = {
            ModelTask.RESEARCH_DIRECTOR,
            ModelTask.RISK_JUDGE,
            ModelTask.REPORT_SYNTHESIS,
            ModelTask.TEMPORAL_ANALYSIS,
            ModelTask.CONNECTION_MAPPING,
        }
        return ModelTier.DEEP if task in deep_tasks else ModelTier.FAST

    async def generate_for_task(
        self,
        task: ModelTask,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        json_mode: bool = False,
    ) -> str:
        """Generate using the model for a specific task role, with provider fallback on transient errors."""
        tier = self._resolve_task_tier(task)
        # generate_for_tier now includes automatic provider fallback on TransientError
        return await self.generate_for_tier(
            tier=tier,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            json_mode=json_mode,
            task=task.value,
        )

    async def generate_structured(
        self,
        provider: ModelProvider,
        system_prompt: str,
        user_prompt: str,
        output_model: type[T],
    ) -> T:
        """
        Generate a structured (Pydantic) response.

        Uses the model's structured output capability where available,
        falls back to JSON parsing with validation.
        """
        model = self.get_model(provider)

        try:
            structured_model = model.with_structured_output(output_model)
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
            result = await structured_model.ainvoke(messages)
            self._track_cost(provider, system_prompt + user_prompt, str(result))
            return result
        except (NotImplementedError, AttributeError):
            pass
        except Exception as e:
            self._wrap_transient(e)
            raise

        # Fallback: ask for JSON and parse manually
        json_prompt = (
            f"{system_prompt}\n\n"
            f"You MUST respond with valid JSON matching this schema:\n"
            f"{json.dumps(output_model.model_json_schema(), indent=2)}\n\n"
            f"Respond with ONLY the JSON object, no other text."
        )
        raw = await self.generate(provider, json_prompt, user_prompt)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned

        return output_model.model_validate_json(cleaned)

    async def generate_structured_for_tier(
        self,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        output_model: type[T],
    ) -> T:
        """Generate structured output using the model for the given tier."""
        provider = self.resolve_tier(tier)
        model = self.get_model_by_tier(tier)

        try:
            structured_model = model.with_structured_output(output_model)
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
            result = await structured_model.ainvoke(messages)
            self._track_cost(provider, system_prompt + user_prompt, str(result))
            return result
        except (NotImplementedError, AttributeError):
            pass
        except Exception as e:
            self._wrap_transient(e)
            raise

        json_prompt = (
            f"{system_prompt}\n\n"
            f"You MUST respond with valid JSON matching this schema:\n"
            f"{json.dumps(output_model.model_json_schema(), indent=2)}\n\n"
            f"Respond with ONLY the JSON object, no other text."
        )
        raw = await self.generate_for_tier(tier, json_prompt, user_prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned
        return output_model.model_validate_json(cleaned)

    def _track_cost(self, provider: ModelProvider, input_text: str, output_text: str) -> None:
        """Approximate cost tracking."""
        costs = COST_PER_1K.get(provider, {"input": 0.002, "output": 0.008})
        input_tokens = len(input_text) / 4
        output_tokens = len(str(output_text)) / 4
        cost = (input_tokens / 1000 * costs["input"]) + (output_tokens / 1000 * costs["output"])
        self._total_cost += cost

    @property
    def total_cost(self) -> float:
        """Total estimated cost across all calls."""
        return self._total_cost

    @property
    def available_providers(self) -> list[ModelProvider]:
        """List of configured providers."""
        return list(self._models.keys())
