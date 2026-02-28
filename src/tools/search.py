"""
Search tool implementations with intelligent fallback.

Supports Tavily (primary, AI-optimized) and Brave (fallback, different result set).
Both are wrapped with rate limiting, error handling, and result normalization
so agent code doesn't care which provider returned the data.
"""

from __future__ import annotations

import asyncio
import contextlib
import socket
import traceback
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
import structlog
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from src.config import get_settings
from src.models import SearchPhase, SearchRecord
from src.observability import metrics as obs_metrics

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None  # type: ignore[assignment]

try:
    import fitz  # pymupdf
    _HAS_PYMUPDF = True
except ImportError:
    _HAS_PYMUPDF = False

try:
    from crawl4ai import AsyncWebCrawler
    try:
        from crawl4ai import BrowserConfig
    except ImportError:
        BrowserConfig = None  # type: ignore[misc, assignment]
    _HAS_CRAWL4AI = True
except ImportError:
    AsyncWebCrawler = None  # type: ignore[misc, assignment]
    BrowserConfig = None  # type: ignore[misc, assignment]
    _HAS_CRAWL4AI = False

logger = structlog.get_logger()


class SearchAuthError(Exception):
    """Auth/credentials error from a search provider — do not retry."""


def _is_retryable_search_error(exc: BaseException) -> bool:
    """Only retry transient failures (5xx, timeouts), not auth (401/403/422)."""
    if isinstance(exc, SearchAuthError):
        return False
    msg = str(exc).lower()
    return not any(code in msg for code in ("401", "403", "422", "unauthorized", "forbidden"))


class NormalizedResult(BaseModel):
    """A single normalized search result from any provider."""

    title: str
    url: str
    snippet: str
    domain: str = ""
    score: float = 0.0
    raw_content: str = ""  # Full page content if available

    def model_post_init(self, __context: Any) -> None:
        if not self.domain and self.url:
            with contextlib.suppress(Exception):
                self.domain = urlparse(self.url).netloc


class SearchResponse(BaseModel):
    """Aggregated search response."""

    query: str
    provider: str
    results: list[NormalizedResult] = Field(default_factory=list)
    total_results: int = 0
    search_time_ms: float = 0.0


class FetchResult(BaseModel):
    """Result of a tiered URL fetch; distinguishes success vs tried-but-inaccessible."""

    content: Optional[str] = None
    status: str = ""
    inaccessible_reason: Optional[str] = None


# Domains that always require login or redirect to an auth-wall in a browser.
# Playwright is skipped for these entirely — saves browser launch time and avoids
# the "Page.content: page is navigating" error caused by JS auth redirects.
_PLAYWRIGHT_SKIP_DOMAINS: frozenset[str] = frozenset({
    "linkedin.com", "www.linkedin.com",
    "facebook.com", "www.facebook.com",
    "instagram.com", "www.instagram.com",
    "twitter.com", "x.com",
    "tiktok.com", "www.tiktok.com",
    "reddit.com", "www.reddit.com",
    "glassdoor.com", "www.glassdoor.com",
    "bloomberg.com", "www.bloomberg.com",
    "wsj.com", "www.wsj.com",
    "ft.com", "www.ft.com",
})

# URL path fragments that indicate an auth-wall redirect occurred during navigation.
_AUTH_WALL_PATHS = ("/authwall", "/login", "/signin", "/signup", "/auth/", "/gated")


def _is_playwright_skip_url(url: str) -> bool:
    """Return True if Playwright should be skipped for this URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.lower() in _PLAYWRIGHT_SKIP_DOMAINS
    except Exception:
        return False


def _is_auth_wall_redirect(final_url: str) -> bool:
    """Return True if a page navigated to a login/auth-wall page."""
    try:
        parsed = urlparse(final_url)
        path = parsed.path.lower()
        return any(path.startswith(frag) or frag in path for frag in _AUTH_WALL_PATHS)
    except Exception:
        return False


# Rotated browser User-Agents for Tier 1 (reduce bot blocking)
_USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


class TavilySearchTool:
    """
    Tavily AI Search - optimized for AI agent consumption.

    Tavily returns clean, pre-processed content ideal for LLM consumption.
    It's the primary search provider for this agent.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.search.tavily_api_key
        self.max_results = settings.search.max_results_per_query
        self.timeout = settings.search.request_timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=1, max=10),
        retry=retry_if_exception(_is_retryable_search_error),
    )
    async def search(
        self,
        query: str,
        max_results: Optional[int] = None,
        include_raw_content: bool = True,
        search_depth: str = "advanced",
    ) -> SearchResponse:
        """
        Execute a Tavily search.

        Args:
            query: Search query string
            max_results: Override default max results
            include_raw_content: Whether to fetch full page content
            search_depth: "basic" or "advanced" (advanced = better but slower)
        """
        if not self.api_key:
            logger.warning("tavily_no_api_key")
            return SearchResponse(query=query, provider="tavily")

        client = await self._get_client()
        start = asyncio.get_event_loop().time()

        payload = {
            "api_key": self.api_key,
            "query": query,
            "max_results": max_results or self.max_results,
            "include_raw_content": include_raw_content,
            "search_depth": search_depth,
        }

        try:
            response = await client.post(
                "https://api.tavily.com/search",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status in (401, 403, 422):
                logger.error("tavily_auth_error", query=query, status=status, error=str(e))
                return SearchResponse(query=query, provider="tavily")
            logger.error("tavily_search_error", query=query, error=str(e))
            raise
        except Exception as e:
            logger.error("tavily_search_error", query=query, error=str(e))
            return SearchResponse(query=query, provider="tavily")

        elapsed = (asyncio.get_event_loop().time() - start) * 1000
        results = []
        if not isinstance(data, dict):
            logger.warning("tavily_unexpected_response_type", query=query, type=type(data).__name__)
            return SearchResponse(query=query, provider="tavily", results=[], total_results=0, search_time_ms=elapsed)
        raw_results = data.get("results", [])
        if not isinstance(raw_results, list):
            raw_results = []
        for item in raw_results:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            results.append(
                NormalizedResult(
                    title=item.get("title") or "",
                    url=item.get("url") or "",
                    snippet=item.get("content") or "",
                    score=float(item.get("score", 0.0)) if item.get("score") is not None else 0.0,
                    raw_content=(item.get("raw_content") or "")[:5000],
                )
            )

        logger.info(
            "tavily_search_complete",
            query=query,
            num_results=len(results),
            time_ms=round(elapsed, 1),
        )

        return SearchResponse(
            query=query,
            provider="tavily",
            results=results,
            total_results=len(results),
            search_time_ms=elapsed,
        )

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class BraveSearchTool:
    """
    Brave Search API - independent search provider for result diversity.

    Used as a fallback when Tavily fails OR as a complement to get
    different result sets for triangulation.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.search.brave_api_key
        self.max_results = settings.search.max_results_per_query
        self.timeout = settings.search.request_timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=1, max=10),
        retry=retry_if_exception(_is_retryable_search_error),
    )
    async def search(
        self,
        query: str,
        max_results: Optional[int] = None,
    ) -> SearchResponse:
        """Execute a Brave search."""
        if not self.api_key:
            logger.warning("brave_no_api_key")
            return SearchResponse(query=query, provider="brave")

        client = await self._get_client()
        start = asyncio.get_event_loop().time()

        try:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={
                    "X-Subscription-Token": self.api_key,
                    "Accept": "application/json",
                },
                params={
                    "q": query,
                    "count": max_results or self.max_results,
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status in (401, 403, 422):
                logger.error("brave_auth_error", query=query, status=status, error=str(e))
                return SearchResponse(query=query, provider="brave")
            logger.error("brave_search_error", query=query, error=str(e))
            raise
        except Exception as e:
            logger.error("brave_search_error", query=query, error=str(e))
            return SearchResponse(query=query, provider="brave")

        elapsed = (asyncio.get_event_loop().time() - start) * 1000
        results = []
        if not isinstance(data, dict):
            logger.warning("brave_unexpected_response_type", query=query, type=type(data).__name__)
            return SearchResponse(query=query, provider="brave", results=[], total_results=0, search_time_ms=elapsed)
        web = data.get("web")
        if not isinstance(web, dict):
            web = {}
        raw_results = web.get("results", [])
        if not isinstance(raw_results, list):
            raw_results = []
        for item in raw_results:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            results.append(
                NormalizedResult(
                    title=item.get("title") or "",
                    url=item.get("url") or "",
                    snippet=item.get("description") or "",
                )
            )

        logger.info(
            "brave_search_complete",
            query=query,
            num_results=len(results),
            time_ms=round(elapsed, 1),
        )

        return SearchResponse(
            query=query,
            provider="brave",
            results=results,
            total_results=len(results),
            search_time_ms=elapsed,
        )

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class WebFetcher:
    """
    Tier 1: Direct web page content fetcher with rotated browser-like headers.

    Used when we have a specific URL to scrape. On 403/429/503 returns
    FetchResult with content=None and inaccessible_reason set (caller may try Tier 2+).
    """

    def __init__(self) -> None:
        self.timeout = 30
        self._client: Optional[httpx.AsyncClient] = None
        self._ua_index = 0

    def _next_headers(self) -> dict[str, str]:
        ua = _USER_AGENTS[self._ua_index % len(_USER_AGENTS)]
        self._ua_index += 1
        return {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://www.google.com/",
        }

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                follow_redirects=True,
            )
        return self._client

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=5))
    async def fetch(self, url: str) -> FetchResult:
        """Tier 1: Fetch via httpx with rotated headers. Returns FetchResult."""
        try:
            client = await self._get_client()
            headers = self._next_headers()
            if _is_sec_gov_url(url):
                headers = {**headers, "User-Agent": _sec_user_agent()}
            response = await client.get(url, headers=headers)
            status = response.status_code
            if status == 200:
                content_type = response.headers.get("content-type", "")
                if "text/html" in content_type or "text/plain" in content_type:
                    return FetchResult(content=response.text[:50000], status=str(status))
                return FetchResult(content=response.text[:50000], status=str(status))
            if status == 403:
                return FetchResult(content=None, status=str(status), inaccessible_reason="blocked_403")
            if status == 429:
                return FetchResult(content=None, status=str(status), inaccessible_reason="rate_limited_429")
            if status == 503:
                return FetchResult(content=None, status=str(status), inaccessible_reason="unavailable_503")
            return FetchResult(
                content=None,
                status=str(status),
                inaccessible_reason=f"http_{status}",
            )
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 403:
                return FetchResult(content=None, status=str(status), inaccessible_reason="blocked_403")
            if status == 429:
                return FetchResult(content=None, status=str(status), inaccessible_reason="rate_limited_429")
            if status == 503:
                return FetchResult(content=None, status=str(status), inaccessible_reason="unavailable_503")
            logger.warning("web_fetch_error", url=url, error=str(e))
            return FetchResult(content=None, status=str(status), inaccessible_reason="http_error")
        except Exception as e:
            logger.warning("web_fetch_error", url=url, error=str(e))
            return FetchResult(content=None, status="error", inaccessible_reason=str(e)[:200])

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


def _is_pdf_url(url: str) -> bool:
    return url.rstrip("/").lower().endswith(".pdf")


def _is_sec_gov_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    return "sec.gov" in host


def _is_regulatory_domain(url: str) -> bool:
    """Return True for domains where crawl4ai optional tier may help (SEC, FINRA, DFPI)."""
    try:
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        return any(
            domain in host
            for domain in ("sec.gov", "finra.org", "dfpi.ca.gov", "brokercheck.finra.org")
        )
    except Exception:
        return False


def _is_sec_litigation_url(url: str) -> bool:
    """Return True when path contains /litigation/ (EFTS does not index these)."""
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    return "/litigation/" in path


def _edgar_query_from_url(url: str) -> Optional[str]:
    """Derive an EDGAR full-text search query from a sec.gov URL (e.g. CIK or filename stem)."""
    parsed = urlparse(url)
    path = (parsed.path or "").strip("/")
    if not path:
        return None
    parts = path.split("/")
    # .../edgar/data/CIK/ACCESSION/filename.htm -> use CIK
    if "edgar" in parts and "data" in parts:
        try:
            i = parts.index("data")
            if i + 1 < len(parts) and parts[i + 1].isdigit():
                return parts[i + 1]  # CIK
        except ValueError:
            pass
    # Fallback: filename without extension (e.g. aapl-20230930)
    if parts:
        last = parts[-1]
        if "." in last:
            return last.rsplit(".", 1)[0]
        return last
    return None


def _sec_user_agent() -> str:
    """SEC-compliant User-Agent (contact email required by SEC policy)."""
    email = get_settings().search.sec_contact_email
    return f"DeepResearchAgent/1.0 {email}"


_EDGAR_BASE = "https://efts.sec.gov/LATEST/search-index"

_WAYBACK_AVAILABLE = "https://archive.org/wayback/available"


class TieredFetcher:
    """
    Four-tier URL fetcher: httpx (rotated) -> Playwright -> domain alternates (e.g. EDGAR) -> Wayback.
    Returns FetchResult; on final failure content is None and inaccessible_reason is set.

    Failure taxonomy:
      Class 1 – Bot-blocked (403/429): domain is live but guards against bots. Escalate tiers.
      Class 2 – Dead domain (DNS failure): subdomain/domain retired. Skip tiers, go to archive recovery.
      Class 3 – Content removed (404): domain alive but page gone. Log + attempt archive recovery.
    """

    # ─── DNS pre-check cache (process-lifetime; domain strings are small) ───
    _dns_cache: dict[str, bool] = {}

    @staticmethod
    def _domain_resolves(url: str) -> bool:
        """Return True if the URL's hostname has valid DNS. Results are cached."""
        try:
            domain = urlparse(url).hostname or ""
        except Exception:
            return True  # can't parse – let normal fetch decide
        if not domain:
            return True
        if domain in TieredFetcher._dns_cache:
            return TieredFetcher._dns_cache[domain]
        try:
            socket.getaddrinfo(domain, None, socket.AF_INET, socket.SOCK_STREAM)
            TieredFetcher._dns_cache[domain] = True
            return True
        except socket.gaierror:
            TieredFetcher._dns_cache[domain] = False
            return False

    def __init__(self) -> None:
        self._tier1 = WebFetcher()
        settings = get_settings()
        self._playwright_timeout = getattr(settings.search, "playwright_timeout", 30000)
        from src.tools.rate_limiter import DomainRateLimiter
        self._rate_limiter = DomainRateLimiter()

    async def _tier3_edgar(self, url: str) -> FetchResult:
        """Tier 3: for sec.gov URLs, use EDGAR full-text search API and return snippets."""
        if not _is_sec_gov_url(url):
            return FetchResult(content=None, status="skip", inaccessible_reason="not_sec_gov")
        if _is_sec_litigation_url(url):
            return FetchResult(
                content=None,
                status="skip",
                inaccessible_reason="sec_litigation_not_in_efts",
            )
        query = _edgar_query_from_url(url)
        if not query or not query.strip():
            return FetchResult(content=None, status="skip", inaccessible_reason="edgar_no_query")
        try:
            async with httpx.AsyncClient(timeout=30, headers={"User-Agent": _sec_user_agent()}) as client:
                resp = await client.get(
                    _EDGAR_BASE,
                    params={"q": query.strip()[:200], "start": 0, "count": 10},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning("tier3_edgar_error", url=url, query=query, error=str(e))
            return FetchResult(
                content=None,
                status="error",
                inaccessible_reason=f"edgar_error: {str(e)[:150]}",
            )
        if not isinstance(data, dict):
            return FetchResult(content=None, status="200", inaccessible_reason="edgar_invalid_response")
        # Best-effort: common response shapes include hits, results, data
        hits = data.get("hits") or data.get("results") or data.get("data")
        if not isinstance(hits, list):
            hits = []
        parts: list[str] = []
        for item in hits[:15]:
            if not isinstance(item, dict):
                continue
            for key in ("snippet", "text", "content", "description", "body"):
                val = item.get(key)
                if isinstance(val, str) and val.strip():
                    parts.append(val.strip())
                    break
            # Some APIs return nested _source or document
            doc = item.get("_source") or item.get("document")
            if isinstance(doc, dict):
                for key in ("snippet", "text", "content", "description", "body"):
                    val = doc.get(key)
                    if isinstance(val, str) and val.strip():
                        parts.append(val.strip())
                        break
        if not parts:
            return FetchResult(content=None, status="200", inaccessible_reason="edgar_no_snippets")
        text = "\n\n".join(parts)[:50000]
        return FetchResult(content=text, status="200")

    async def _tier4_wayback(self, url: str) -> FetchResult:
        """Tier 4: try Wayback Machine; get latest snapshot URL then fetch it."""
        try:
            async with httpx.AsyncClient(
                timeout=15,
                headers={"User-Agent": _USER_AGENTS[0]},
            ) as client:
                avail = await client.get(_WAYBACK_AVAILABLE, params={"url": url})
                avail.raise_for_status()
                data = avail.json()
        except Exception as e:
            logger.warning("tier4_wayback_available_error", url=url, error=str(e))
            return FetchResult(
                content=None,
                status="error",
                inaccessible_reason=f"wayback_error: {str(e)[:150]}",
            )
        if not isinstance(data, dict):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_invalid_response")
        snapshots = data.get("archived_snapshots") or {}
        if not isinstance(snapshots, dict):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_unavailable")
        closest = snapshots.get("closest")
        if not isinstance(closest, dict):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_unavailable")
        snapshot_url = closest.get("url")
        if not isinstance(snapshot_url, str) or not snapshot_url.startswith("http"):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_unavailable")
        # Fetch the snapshot with Tier 1
        r = await self._tier1.fetch(snapshot_url)
        if r.content is not None:
            return r
        return FetchResult(
            content=None,
            status=r.status or "error",
            inaccessible_reason="wayback_unavailable",
        )

    async def _tier2_playwright(self, url: str) -> FetchResult:
        """Tier 2: headless browser fetch. For PDFs use context.request.get and pymupdf when available."""
        if async_playwright is None:
            return FetchResult(content=None, status="skip", inaccessible_reason="playwright_not_available")
        if _is_playwright_skip_url(url):
            return FetchResult(content=None, status="skip", inaccessible_reason="playwright_skip_gated_domain")
        try:
            async with async_playwright() as p:
                launch_opts: dict = {"headless": True}
                if get_settings().search.playwright_disable_http2:
                    launch_opts["args"] = ["--disable-http2"]
                browser = await p.chromium.launch(**launch_opts)
                try:
                    if _is_pdf_url(url):
                        ctx_opts = {"user_agent": _sec_user_agent()} if _is_sec_gov_url(url) else {}
                        context = await browser.new_context(**ctx_opts)
                        try:
                            page = await context.new_page()
                            response = await page.request.get(url, timeout=self._playwright_timeout)
                            if response.status != 200:
                                return FetchResult(
                                    content=None,
                                    status=str(response.status),
                                    inaccessible_reason=f"playwright_pdf_{response.status}",
                                )
                            if _HAS_PYMUPDF:
                                pdf_bytes = await response.body()
                                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                                text = "\n".join(p.get_text() for p in doc)[:50000]
                                doc.close()
                                return FetchResult(content=text, status="200")
                            return FetchResult(
                                content=None, status="200", inaccessible_reason="pdf_no_text_extraction"
                            )
                        finally:
                            await context.close()
                    page = await browser.new_page()
                    await page.goto(url, wait_until="domcontentloaded", timeout=self._playwright_timeout)
                    # Wait for any JS-triggered redirects (e.g. auth walls) to settle
                    # before calling page.content(), which raises if the page is mid-navigation.
                    with contextlib.suppress(Exception):
                        await page.wait_for_load_state("networkidle", timeout=5000)
                    # Detect auth-wall redirects (e.g. LinkedIn /authwall, paywalls)
                    final_url = page.url
                    if _is_auth_wall_redirect(final_url):
                        logger.debug("tier2_playwright_auth_wall", original_url=url, redirected_to=final_url)
                        return FetchResult(content=None, status="403", inaccessible_reason="playwright_auth_wall")
                    content = await page.content()
                    text = (content or "")[:50000]
                    return FetchResult(content=text, status="200")
                finally:
                    await browser.close()
        except Exception as e:
            logger.warning("tier2_playwright_error", url=url, error=str(e))
            return FetchResult(
                content=None,
                status="error",
                inaccessible_reason=f"playwright_error: {str(e)[:150]}",
            )

    async def _tier2_5_crawl4ai(self, url: str) -> FetchResult:
        """Tier 2.5: optional crawl4ai fetch for regulatory domains when USE_CRAWL4AI_FETCH and crawl4ai installed."""
        if not _HAS_CRAWL4AI or AsyncWebCrawler is None:
            return FetchResult(content=None, status="skip", inaccessible_reason="crawl4ai_not_available")
        settings = get_settings()
        if not getattr(settings.search, "use_crawl4ai_fetch", False):
            return FetchResult(content=None, status="skip", inaccessible_reason="crawl4ai_disabled")
        if not _is_regulatory_domain(url):
            return FetchResult(content=None, status="skip", inaccessible_reason="not_regulatory_domain")
        timeout_ms = min(20000, getattr(settings.search, "playwright_timeout", 30000))
        try:
            user_agent = _sec_user_agent() if _is_sec_gov_url(url) else _USER_AGENTS[0]
            if BrowserConfig is not None:
                browser_config = BrowserConfig(
                    browser_type="chromium",
                    headless=True,
                    user_agent=user_agent,
                )
            else:
                browser_config = {"browser_type": "chromium", "headless": True}
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await asyncio.wait_for(
                    crawler.arun(url=url),
                    timeout=timeout_ms / 1000.0,
                )
            if result and getattr(result, "success", False) and getattr(result, "markdown", None):
                text = (result.markdown or "")[:50000]
                if text.strip():
                    return FetchResult(content=text, status="200")
            return FetchResult(
                content=None,
                status="200",
                inaccessible_reason="crawl4ai_no_content",
            )
        except asyncio.TimeoutError:
            logger.warning("tier2_5_crawl4ai_timeout", url=url)
            return FetchResult(content=None, status="timeout", inaccessible_reason="crawl4ai_timeout")
        except Exception as e:
            logger.warning("tier2_5_crawl4ai_error", url=url, error=str(e))
            return FetchResult(
                content=None,
                status="error",
                inaccessible_reason=f"crawl4ai_error: {str(e)[:150]}",
            )

    # ─── Archive / recovery helpers ─────────────────────────────────────────

    async def _try_wayback_machine(self, url: str) -> FetchResult:
        """
        Check Wayback Machine availability API and, if a snapshot exists,
        fetch it via Tier 1. Returns FetchResult with content on success.
        """
        try:
            async with httpx.AsyncClient(
                timeout=10, headers={"User-Agent": _USER_AGENTS[0]}
            ) as client:
                avail = await client.get(
                    _WAYBACK_AVAILABLE, params={"url": url}
                )
                avail.raise_for_status()
                data = avail.json()
        except Exception as e:
            logger.debug("wayback_availability_check_failed", url=url, error=str(e))
            return FetchResult(content=None, status="error", inaccessible_reason=f"wayback_check_error: {str(e)[:120]}")

        if not isinstance(data, dict):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_invalid_response")
        closest = (data.get("archived_snapshots") or {}).get("closest")
        if not isinstance(closest, dict):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_no_snapshot")
        # Require status 200 from the snapshot
        if closest.get("status") != "200":
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_snapshot_not_200")
        snapshot_url = closest.get("url", "")
        if not snapshot_url.startswith("http"):
            return FetchResult(content=None, status="200", inaccessible_reason="wayback_bad_snapshot_url")
        r = await self._tier1.fetch(snapshot_url)
        if r.content is not None:
            return FetchResult(
                content=r.content,
                status="200",
                inaccessible_reason=None,
            )
        return FetchResult(content=None, status=r.status or "error", inaccessible_reason="wayback_fetch_failed")

    async def _search_for_relocated_content(self, url: str) -> Optional[FetchResult]:
        """
        Extract key terms from a dead URL's path slug and search for the same
        content on live domains. Useful when a page moved but content is still
        available elsewhere.
        """
        try:
            parsed = urlparse(url)
            path = parsed.path or ""
            slug = path.rstrip("/").split("/")[-1]
            # Strip common extensions
            for ext in (".html", ".htm", ".asp", ".aspx", ".php"):
                if slug.lower().endswith(ext):
                    slug = slug[: -len(ext)]
                    break
            terms = slug.replace("-", " ").replace("_", " ").strip()
            if len(terms.split()) < 3:
                return None  # slug too short to give useful search signal

            # Include the org name hinted by the hostname
            domain = parsed.hostname or ""
            # e.g. apps.americanbar.org -> "americanbar"
            parts = domain.split(".")
            org_hint = parts[-2] if len(parts) >= 2 else parts[0] if parts else ""

            query = f'"{terms}" {org_hint}'.strip()
            logger.debug("searching_for_relocated_content", query=query, original_url=url)

            # Perform a lightweight search using Tavily (no raw content needed)
            searcher = TavilySearchTool()
            try:
                resp = await searcher.search(query, max_results=3, include_raw_content=False, search_depth="basic")
            finally:
                await searcher.close()

            if not resp.results:
                return None

            # Attempt to fetch the top result
            top = resp.results[0]
            fetched = await self._tier1.fetch(top.url)
            if fetched.content:
                fetched.inaccessible_reason = None
                return fetched
        except Exception as e:
            logger.debug("search_for_relocated_content_error", url=url, error=str(e))
        return None

    async def _recover_dead_url(
        self, url: str, domain: str
    ) -> FetchResult:
        """
        Recovery pipeline for Class 2 (dead domain) and Class 3 (404) failures.
        Tries: Wayback Machine -> content-relocation search.
        """
        obs_metrics.record_dead_domain(domain=domain, recovery_method="attempt")

        # Strategy 1: Wayback Machine
        wb = await self._try_wayback_machine(url)
        if wb.content is not None:
            logger.info("dead_url_recovered_via_wayback", url=url, domain=domain)
            obs_metrics.record_dead_domain(domain=domain, recovery_method="wayback")
            return wb

        # Strategy 2: Search for the content on a live domain using URL slug
        relocated = await self._search_for_relocated_content(url)
        if relocated and relocated.content:
            logger.info("dead_url_content_found_elsewhere", original_url=url, domain=domain)
            obs_metrics.record_dead_domain(domain=domain, recovery_method="relocated")
            return relocated

        # All recovery failed
        obs_metrics.record_dead_domain(domain=domain, recovery_method="unrecoverable")
        return FetchResult(
            content=None,
            status="dead",
            inaccessible_reason=(
                f"Domain {domain} no longer resolves (DNS failure). "
                "Wayback Machine and content-relocation recovery both failed."
            ),
        )

    # ─── Main fetch entry points ─────────────────────────────────────────────

    async def fetch(self, url: str) -> FetchResult:
        """Run tiered fetch with DNS pre-check + failure taxonomy. Returns FetchResult."""
        async with self._rate_limiter.acquire(url):
            return await self._fetch_inner(url)

    async def _fetch_inner(self, url: str) -> FetchResult:
        """Inner fetch logic (called within rate limiter). Three-class failure taxonomy."""
        import time as _time
        domain = (urlparse(url).netloc or "unknown")[:64]
        hostname = (urlparse(url).hostname or "")[:64]

        # ── Class 2: Dead domain (DNS failure) ─────────────────────────────
        # Skip tiers 1-3 entirely — no point sending HTTP to a dead domain.
        if not self._domain_resolves(url):
            logger.warning(
                "domain_dns_failed",
                domain=hostname,
                url=url,
                action="skipping_to_archive_recovery",
            )
            return await self._recover_dead_url(url, hostname)

        # ── Tier 1: httpx with rotated headers ─────────────────────────────
        t0 = _time.perf_counter()
        r = await self._tier1.fetch(url)
        obs_metrics.record_fetch(
            domain=domain,
            tier=1,
            status_code=r.status or ("ok" if r.content else "fail"),
            duration=_time.perf_counter() - t0,
        )
        if r.content is not None:
            return r

        # ── Class 1: Bot-blocked (403/429) → escalate through browser tiers ─
        if r.status in ("403", "429"):
            obs_metrics.record_tier_escalation(domain=domain, from_tier=1, to_tier=2)

            t0 = _time.perf_counter()
            r2 = await self._tier2_playwright(url)
            obs_metrics.record_fetch(
                domain=domain,
                tier=2,
                status_code=r2.status or ("ok" if r2.content else "fail"),
                duration=_time.perf_counter() - t0,
            )
            if r2.content is not None:
                return r2
            obs_metrics.record_tier_escalation(domain=domain, from_tier=2, to_tier=3)

            t0 = _time.perf_counter()
            r2_5 = await self._tier2_5_crawl4ai(url)
            obs_metrics.record_fetch(
                domain=domain,
                tier=3,
                status_code=r2_5.status or ("ok" if r2_5.content else "fail"),
                duration=_time.perf_counter() - t0,
            )
            if r2_5.content is not None:
                return r2_5
            obs_metrics.record_tier_escalation(domain=domain, from_tier=3, to_tier=4)

            t0 = _time.perf_counter()
            r3 = await self._tier3_edgar(url)
            obs_metrics.record_fetch(
                domain=domain,
                tier=4,
                status_code=r3.status or ("ok" if r3.content else "fail"),
                duration=_time.perf_counter() - t0,
            )
            if r3.content is not None:
                return r3
            obs_metrics.record_tier_escalation(domain=domain, from_tier=4, to_tier=5)

            t0 = _time.perf_counter()
            r4 = await self._tier4_wayback(url)
            obs_metrics.record_fetch(
                domain=domain,
                tier=5,
                status_code=r4.status or ("ok" if r4.content else "fail"),
                duration=_time.perf_counter() - t0,
            )
            if r4.content is not None:
                return r4
            # Return most informative failure reason
            for candidate in (r4, r3, r2_5, r2, r):
                if candidate.inaccessible_reason:
                    return candidate
            return r

        # ── Class 3: Content removed (404) → archive recovery ───────────────
        if r.status == "404":
            logger.info(
                "content_removed",
                url=url,
                domain=hostname,
                note="Page returned 404; attempting archive recovery.",
            )
            recovered = await self._recover_dead_url(url, hostname)
            if recovered.content:
                recovered.inaccessible_reason = (
                    f"Original URL returned 404 (content removed). "
                    f"Recovered via archive/relocation."
                )
            return recovered

        # ── Any other non-200 (e.g. 500, 503) → existing tier cascade ───────
        obs_metrics.record_tier_escalation(domain=domain, from_tier=1, to_tier=2)

        t0 = _time.perf_counter()
        r2 = await self._tier2_playwright(url)
        obs_metrics.record_fetch(
            domain=domain,
            tier=2,
            status_code=r2.status or ("ok" if r2.content else "fail"),
            duration=_time.perf_counter() - t0,
        )
        if r2.content is not None:
            return r2
        obs_metrics.record_tier_escalation(domain=domain, from_tier=2, to_tier=3)

        t0 = _time.perf_counter()
        r2_5 = await self._tier2_5_crawl4ai(url)
        obs_metrics.record_fetch(
            domain=domain,
            tier=3,
            status_code=r2_5.status or ("ok" if r2_5.content else "fail"),
            duration=_time.perf_counter() - t0,
        )
        if r2_5.content is not None:
            return r2_5
        obs_metrics.record_tier_escalation(domain=domain, from_tier=3, to_tier=4)

        t0 = _time.perf_counter()
        r3 = await self._tier3_edgar(url)
        obs_metrics.record_fetch(
            domain=domain,
            tier=4,
            status_code=r3.status or ("ok" if r3.content else "fail"),
            duration=_time.perf_counter() - t0,
        )
        if r3.content is not None:
            return r3
        obs_metrics.record_tier_escalation(domain=domain, from_tier=4, to_tier=5)

        t0 = _time.perf_counter()
        r4 = await self._tier4_wayback(url)
        obs_metrics.record_fetch(
            domain=domain,
            tier=5,
            status_code=r4.status or ("ok" if r4.content else "fail"),
            duration=_time.perf_counter() - t0,
        )
        if r4.content is not None:
            return r4
        for candidate in (r4, r3, r2_5, r2, r):
            if candidate.inaccessible_reason:
                return candidate
        return r

    async def close(self) -> None:
        await self._tier1.close()


class SearchOrchestrator:
    """
    Coordinates multiple search providers with intelligent fallback.

    Strategy:
    1. Primary: Tavily (AI-optimized, includes raw content)
    2. Fallback: Brave (different index, useful for diversity)
    3. For triangulation: run both in parallel, deduplicate by URL
    """

    def __init__(self) -> None:
        self.tavily = TavilySearchTool()
        self.brave = BraveSearchTool()
        self.fetcher = TieredFetcher()

    async def search(
        self,
        query: str,
        phase: SearchPhase = SearchPhase.BASELINE,
        iteration: int = 0,
        use_both: bool = False,
    ) -> tuple[SearchResponse, SearchRecord]:
        """
        Execute a search with automatic fallback.

        Returns:
            Tuple of (SearchResponse, SearchRecord for state tracking)
        """
        if use_both:
            return await self._parallel_search(query, phase, iteration)

        phase_str = phase.value if hasattr(phase, "value") else str(phase)
        async with obs_metrics.track_search(provider="tavily", phase=phase_str) as tracker:
            response = await self.tavily.search(query)
            tracker.set_results(len(response.results))
        if response.results:
            record = SearchRecord(
                query=query,
                provider="tavily",
                phase=phase,
                iteration=iteration,
                num_results=len(response.results),
                result_urls=[r.url for r in response.results],
                raw_snippets=[r.snippet for r in response.results[:5]],
            )
            return response, record

        logger.info("search_fallback_to_brave", query=query)
        async with obs_metrics.track_search(provider="brave", phase=phase_str) as tracker:
            response = await self.brave.search(query)
            tracker.set_results(len(response.results))
        record = SearchRecord(
            query=query,
            provider="brave",
            phase=phase,
            iteration=iteration,
            num_results=len(response.results),
            result_urls=[r.url for r in response.results],
            raw_snippets=[r.snippet for r in response.results[:5]],
            was_useful=len(response.results) > 0,
        )
        return response, record

    async def _parallel_search(
        self,
        query: str,
        phase: SearchPhase,
        iteration: int,
    ) -> tuple[SearchResponse, SearchRecord]:
        """Run both providers in parallel and merge results."""
        phase_str = phase.value if hasattr(phase, "value") else str(phase)

        async with obs_metrics.track_search(provider="tavily", phase=phase_str) as t_tracker:
            async with obs_metrics.track_search(provider="brave", phase=phase_str) as b_tracker:
                tavily_task = self.tavily.search(query)
                brave_task = self.brave.search(query)
                tavily_resp, brave_resp = await asyncio.gather(
                    tavily_task, brave_task, return_exceptions=True
                )
                t_tracker.set_results(
                    len(tavily_resp.results)
                    if not isinstance(tavily_resp, Exception) and hasattr(tavily_resp, "results")
                    else 0
                )
                b_tracker.set_results(
                    len(brave_resp.results)
                    if not isinstance(brave_resp, Exception) and hasattr(brave_resp, "results")
                    else 0
                )

        merged_results: list[NormalizedResult] = []
        seen_urls: set[str] = set()

        for resp in [tavily_resp, brave_resp]:
            if isinstance(resp, Exception):
                tb = "".join(traceback.format_exception(type(resp), resp, resp.__traceback__))
                logger.warning("parallel_search_error", error=str(resp), traceback=tb)
                continue
            for result in resp.results:
                if result.url not in seen_urls:
                    seen_urls.add(result.url)
                    merged_results.append(result)

        merged = SearchResponse(
            query=query,
            provider="tavily+brave",
            results=merged_results,
            total_results=len(merged_results),
        )
        record = SearchRecord(
            query=query,
            provider="tavily+brave",
            phase=phase,
            iteration=iteration,
            num_results=len(merged_results),
            result_urls=[r.url for r in merged_results],
            raw_snippets=[r.snippet for r in merged_results[:5]],
        )
        return merged, record

    async def fetch_url(self, url: str) -> FetchResult:
        """Fetch a specific URL; returns FetchResult (content may be None if inaccessible)."""
        return await self.fetcher.fetch(url)

    async def close(self) -> None:
        """Clean up all HTTP clients."""
        await self.tavily.close()
        await self.brave.close()
        await self.fetcher.close()
