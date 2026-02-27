"""
Per-domain rate limiter using asyncio semaphores.

Reads domain policies from YAML config to enforce per-domain concurrency
and rate limits for web fetching and search providers.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlparse

import structlog

from src.config import get_settings

logger = structlog.get_logger()


class DomainRateLimiter:
    """Per-domain rate limiting using asyncio semaphores and token bucket."""

    def __init__(self) -> None:
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._last_request: dict[str, float] = {}
        self._policies: dict[str, dict[str, Any]] = {}
        self._defaults: dict[str, Any] = {}
        self._loaded = False

    def _load_policies(self) -> None:
        """Load domain policies from config (lazy)."""
        if self._loaded:
            return
        self._loaded = True
        settings = get_settings()
        dp = settings.domain_policies
        self._defaults = dp.get("defaults", {
            "requests_per_second": 2.0,
            "concurrent_limit": 5,
        })
        for domain, policy in dp.get("domains", {}).items():
            self._policies[domain.lower()] = policy

    def _get_policy(self, domain: str) -> dict[str, Any]:
        """Get rate limit policy for a domain."""
        self._load_policies()
        domain_lower = domain.lower()
        # Exact match first
        if domain_lower in self._policies:
            return self._policies[domain_lower]
        # Strip www. prefix
        bare = domain_lower.removeprefix("www.")
        if bare in self._policies:
            return self._policies[bare]
        return self._defaults

    def _get_semaphore(self, domain: str) -> asyncio.Semaphore:
        """Get or create a semaphore for the domain."""
        if domain not in self._semaphores:
            policy = self._get_policy(domain)
            limit = int(policy.get("concurrent_limit", self._defaults.get("concurrent_limit", 5)))
            self._semaphores[domain] = asyncio.Semaphore(limit)
        return self._semaphores[domain]

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL."""
        try:
            parsed = urlparse(url)
            return (parsed.netloc or "").lower()
        except Exception:
            return "unknown"

    @asynccontextmanager
    async def acquire(self, url: str) -> AsyncIterator[None]:
        """Context manager that enforces per-domain rate limits."""
        domain = self._extract_domain(url)
        policy = self._get_policy(domain)
        rps = float(policy.get("requests_per_second", self._defaults.get("requests_per_second", 2.0)))
        min_interval = 1.0 / rps if rps > 0 else 0.0

        sem = self._get_semaphore(domain)
        async with sem:
            # Token bucket: wait if too soon since last request
            now = time.monotonic()
            last = self._last_request.get(domain, 0.0)
            wait_time = min_interval - (now - last)
            if wait_time > 0:
                await asyncio.sleep(wait_time)
            self._last_request[domain] = time.monotonic()
            yield
