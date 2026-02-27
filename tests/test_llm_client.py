"""Tests for LLM client: budget, cost tracking, error classification, tier resolution."""

import pytest

from src.llm_client import (
    BudgetExhaustedError,
    LLMClient,
    ModelProvider,
    ModelTier,
    PermanentError,
    TransientError,
    _classify_error,
)


def test_classify_error_transient() -> None:
    assert _classify_error(Exception("rate limit")) is TransientError
    assert _classify_error(Exception("429")) is TransientError
    assert _classify_error(Exception("503 timeout")) is TransientError


def test_classify_error_permanent() -> None:
    assert _classify_error(Exception("401 unauthorized")) is PermanentError
    assert _classify_error(Exception("invalid api key")) is PermanentError


def test_llm_client_budget_zero_no_check() -> None:
    """When budget is 0, no BudgetExhaustedError should be raised by check."""
    client = LLMClient(budget_usd=0.0)
    client._total_cost = 100.0
    client._check_budget(ModelProvider.CLAUDE, 10000)
    # No raise


def test_llm_client_budget_exhausted_raises() -> None:
    """When cost would exceed budget, _check_budget raises BudgetExhaustedError."""
    client = LLMClient(budget_usd=0.01)
    client._total_cost = 0.009
    with pytest.raises(BudgetExhaustedError):
        client._check_budget(ModelProvider.CLAUDE, 50000)


def test_llm_client_track_cost() -> None:
    client = LLMClient(budget_usd=0)
    assert client.total_cost == 0.0
    client._track_cost(ModelProvider.OPENAI, "x" * 4000, "y" * 4000)
    assert client.total_cost > 0


def test_resolve_tier_deep_returns_first_available() -> None:
    """resolve_tier(DEEP) returns first of CLAUDE, OPENAI, GEMINI that is available."""
    client = LLMClient(budget_usd=0)
    client._models.clear()
    client._fast_models.clear()
    client._models[ModelProvider.GEMINI] = object()  # type: ignore[assignment]
    client._fast_models[ModelProvider.GEMINI] = object()  # type: ignore[assignment]
    assert client.resolve_tier(ModelTier.DEEP) == ModelProvider.GEMINI


def test_resolve_tier_fast_prefers_cheapest_order() -> None:
    """resolve_tier(FAST) prefers GEMINI then OPENAI then CLAUDE."""
    client = LLMClient(budget_usd=0)
    client._models.clear()
    client._fast_models.clear()
    client._fast_models[ModelProvider.OPENAI] = object()  # type: ignore[assignment]
    client._fast_models[ModelProvider.CLAUDE] = object()  # type: ignore[assignment]
    # Order is GEMINI, OPENAI, CLAUDE; GEMINI not in dict, so returns OPENAI
    assert client.resolve_tier(ModelTier.FAST) == ModelProvider.OPENAI


def test_resolve_tier_fast_returns_first_available() -> None:
    client = LLMClient(budget_usd=0)
    client._models.clear()
    client._fast_models.clear()
    client._fast_models[ModelProvider.GEMINI] = object()  # type: ignore[assignment]
    assert client.resolve_tier(ModelTier.FAST) == ModelProvider.GEMINI


def test_resolve_tier_no_models_raises() -> None:
    client = LLMClient(budget_usd=0)
    client._models.clear()
    client._fast_models.clear()
    with pytest.raises(PermanentError, match="No LLM models available"):
        client.resolve_tier(ModelTier.DEEP)


def test_get_model_by_tier_fast_uses_fast_model() -> None:
    """get_model_by_tier(FAST) returns the fast model when available."""
    client = LLMClient(budget_usd=0)
    deep_model = object()
    fast_model = object()
    client._models.clear()
    client._fast_models.clear()
    client._models[ModelProvider.CLAUDE] = deep_model  # type: ignore[assignment]
    client._fast_models[ModelProvider.CLAUDE] = fast_model  # type: ignore[assignment]
    assert client.get_model_by_tier(ModelTier.FAST) is fast_model
    assert client.get_model_by_tier(ModelTier.DEEP) is deep_model


def test_cost_tracking_per_tier() -> None:
    """Cost is tracked when using tier (same provider-based cost)."""
    client = LLMClient(budget_usd=0)
    client._track_cost(ModelProvider.CLAUDE, "a" * 400, "b" * 400)
    before = client.total_cost
    client._track_cost(ModelProvider.GEMINI, "c" * 400, "d" * 400)
    assert client.total_cost > before
