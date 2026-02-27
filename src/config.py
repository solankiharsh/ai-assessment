"""
Centralized configuration for the Deep Research Agent.

All settings are loaded from environment variables with sensible defaults.
Pydantic Settings provides validation and type coercion.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

# Load .env then .env.local (so .env.local overrides). Use override=True so file wins over shell.
_repo_root = Path(__file__).resolve().parent.parent
load_dotenv(_repo_root / ".env", override=True)
_env_local = _repo_root / ".env.local"
if _env_local.exists():
    load_dotenv(_env_local, override=True)

# Refuse to use known expired key suffix so we never send it to the API
_EXPIRED_KEY_SUFFIX = "44da"
for _key in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
    if os.environ.get(_key, "").strip().endswith(_EXPIRED_KEY_SUFFIX):
        os.environ[_key] = ""

# Disable LangSmith tracing when no API key — avoids 403 Forbidden noise
if not os.environ.get("LANGCHAIN_API_KEY", "").strip():
    os.environ["LANGCHAIN_TRACING_V2"] = "false"


class LLMConfig(BaseSettings):
    """LLM provider API keys and model identifiers. Prefer LiteLLM when set."""

    # LiteLLM proxy: single key and base URL; proxy routes to Claude/OpenAI/Gemini. Takes precedence when set.
    litellm_api_key: str = Field(default="", alias="LITELLM_API_KEY")
    litellm_api_base: str = Field(
        default="https://localhost:4000/v1 ",
        alias="LITELLM_API_BASE",
        description="LiteLLM proxy base URL (OpenAI-compatible).",
    )

    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    google_api_key: str = Field(default="", alias="GOOGLE_API_KEY")

    # Model identifiers — use IDs allowed by your gateway (e.g. Deriv LiteLLM team allowlist).
    # Defaults below match common allowlists (claude-opus-4-5, claude-sonnet-4-6, gpt-4.1, gemini-2.5-pro, etc.).
    claude_model: str = Field(default="claude-opus-4-5", alias="CLAUDE_MODEL")
    openai_model: str = Field(default="gpt-4.1", alias="OPENAI_MODEL")
    gemini_model: str = Field(default="gemini-2.5-pro", alias="GEMINI_MODEL")

    # Fast-tier models (cheaper, for routine extraction / debate agents)
    claude_fast_model: str = Field(default="claude-sonnet-4-6", alias="CLAUDE_FAST_MODEL")
    openai_fast_model: str = Field(default="gpt-4.1-mini", alias="OPENAI_FAST_MODEL")
    gemini_fast_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_FAST_MODEL")

    # Shared generation params
    temperature: float = 0.1
    max_tokens: int = 4096


class SearchConfig(BaseSettings):
    """Search provider configuration."""

    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")
    brave_api_key: str = Field(default="", alias="BRAVE_SEARCH_API_KEY")
    max_results_per_query: int = Field(default=10, alias="MAX_SEARCH_RESULTS_PER_QUERY")
    request_timeout: int = 30  # seconds
    # Tiered fetch: Playwright fallback timeout (ms)
    playwright_timeout: int = Field(default=30000, alias="PLAYWRIGHT_FETCH_TIMEOUT")
    sec_contact_email: str = Field(
        default="research@example.com",
        alias="SEC_CONTACT_EMAIL",
        description="Email for SEC EDGAR User-Agent compliance",
    )
    use_crawl4ai_fetch: bool = Field(
        default=False,
        alias="USE_CRAWL4AI_FETCH",
        description="When True and crawl4ai is installed, use crawl4ai as optional fetch tier for regulatory domains.",
    )


class Neo4jConfig(BaseSettings):
    """Neo4j connection settings."""

    uri: str = Field(default="bolt://localhost:7687", alias="NEO4J_URI")
    username: str = Field(default="neo4j", alias="NEO4J_USERNAME")
    password: str = Field(default="", alias="NEO4J_PASSWORD")
    database: str = "neo4j"


class AgentConfig(BaseSettings):
    """Agent behavior tuning."""

    max_search_iterations: int = Field(default=8, alias="MAX_SEARCH_ITERATIONS")
    confidence_threshold: float = Field(default=0.6, alias="CONFIDENCE_THRESHOLD")
    max_entities_per_search: int = 20
    max_connections_depth: int = 3
    enable_adversarial_search: bool = True
    enable_graph_db: bool = True
    # Cost budget per investigation (USD); 0 = no limit
    cost_budget_usd: float = Field(default=5.0, alias="COST_BUDGET_USD")
    # Fuzzy entity deduplication threshold (0.0-1.0); 0 = disabled (exact only)
    entity_fuzzy_threshold: float = 0.85
    # Diminishing returns: min new entities in last N iterations to continue
    diminishing_returns_min_entities: int = 2
    diminishing_returns_lookback_iterations: int = 2


class ObservabilityConfig(BaseSettings):
    """LangSmith, Prometheus metrics, and optional OTLP."""

    langsmith_api_key: str = Field(default="", alias="LANGCHAIN_API_KEY")
    langsmith_project: str = Field(default="deep-research-agent", alias="LANGCHAIN_PROJECT")
    tracing_enabled: bool = Field(default=False, alias="LANGCHAIN_TRACING_V2")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    # Prometheus: agent exposes /metrics on this port when enabled
    metrics_enabled: bool = Field(default=False, alias="PROMETHEUS_METRICS_ENABLED")
    metrics_port: int = Field(default=8000, alias="PROMETHEUS_METRICS_PORT")
    pushgateway_url: str = Field(default="", alias="PROMETHEUS_PUSHGATEWAY_URL")
    otlp_endpoint: str = Field(default="", alias="OTEL_EXPORTER_OTLP_ENDPOINT")


class YAMLConfigLoader:
    """Loads YAML config files from a configurable directory."""

    def __init__(self, config_dir: str | Path = "config") -> None:
        self._dir = _repo_root / config_dir

    def load(self, filename: str) -> dict[str, Any]:
        """Load a YAML file; returns empty dict if file or pyyaml unavailable."""
        try:
            import yaml
        except ImportError:
            return {}
        path = self._dir / filename
        if not path.exists():
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}


class Settings(BaseSettings):
    """Root settings container — access all config from one object."""

    llm: LLMConfig = Field(default_factory=LLMConfig)
    search: SearchConfig = Field(default_factory=SearchConfig)
    neo4j: Neo4jConfig = Field(default_factory=Neo4jConfig)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    observability: ObservabilityConfig = Field(default_factory=ObservabilityConfig)

    # YAML-loaded config (populated in get_settings)
    source_authority: dict[str, Any] = Field(default_factory=dict)
    domain_policies: dict[str, Any] = Field(default_factory=dict)
    model_routing: dict[str, Any] = Field(default_factory=dict)
    risk_categories: dict[str, Any] = Field(default_factory=dict)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton settings instance. Cached after first call."""
    settings = Settings()
    loader = YAMLConfigLoader()
    settings.source_authority = loader.load("source_authority.yaml")
    settings.domain_policies = loader.load("domain_policies.yaml")
    settings.model_routing = loader.load("models.yaml")
    settings.risk_categories = loader.load("risk_categories.yaml")
    return settings
