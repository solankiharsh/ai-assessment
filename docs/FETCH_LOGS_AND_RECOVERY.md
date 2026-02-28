# Fetch logs and URL recovery

During web research, the tiered fetcher (httpx → Playwright → EDGAR → Wayback) logs events when URLs are dead, bot-blocked, or fail with protocol errors. The run **does not fail**; failed URLs are recorded in `state.inaccessible_urls` and the pipeline continues.

## What you’re seeing

### Recovery successes (informational)

| Log event | Meaning |
|-----------|--------|
| **dead_url_recovered_via_wayback** | The URL’s domain failed DNS or the page was gone; content was successfully loaded from the Wayback Machine. |
| **dead_url_content_found_elsewhere** | Same as above, but the content was found on another live page (e.g. same site or via search) instead of Wayback. |

These are **successful recoveries**. The agent still gets content for the investigation.

### Dead domain (recovery attempted)

| Log event | Meaning |
|-----------|--------|
| **domain_dns_failed** | The hostname did not resolve (DNS failure). The fetcher skips direct HTTP and tries **Wayback → search for relocated content**. If recovery succeeds, you see one of the events above; if not, the URL is marked inaccessible. |

### Fetch failures (non-fatal)

| Log event | Meaning |
|-----------|--------|
| **web_fetch_error** | Tier 1 (httpx) threw an exception (e.g. connection reset, timeout, or HTTP/2 protocol error). The pipeline falls back to Tier 2 (Playwright), then Tier 3/4 (EDGAR/Wayback) where applicable. |
| **tier2_playwright_error** | Playwright (headless Chromium) failed to load the page. A common cause is **net::ERR_HTTP2_PROTOCOL_ERROR**: the server or CDN closes the HTTP/2 connection (often for headless or automated traffic). |

For **ERR_HTTP2_PROTOCOL_ERROR**:

- The run continues; the URL is recorded as inaccessible and the report’s “Sources identified but not retrievable” section can list it.
- Some sites (e.g. certain news domains) are known to trigger this in headless mode. You can try enabling the optional **disable HTTP/2** flag for Playwright (see below) to force HTTP/1.1; it does not always fix the issue.

## How the pipeline handles it

1. **Tier 1 (httpx)** fails → **Tier 2 (Playwright)** is tried (and optionally Tier 2.5 crawl4ai for regulatory domains).
2. **Tier 2** fails → **Tier 3 (EDGAR)** for `sec.gov` URLs, else skip.
3. **Tier 4 (Wayback)** is tried when applicable.
4. If all tiers fail, the URL is returned with `content=None` and `inaccessible_reason` set. The orchestrator records it in **state.inaccessible_urls** (and the report’s “Sources identified but not retrievable” section).
5. **DNS-dead domains** skip Tier 1/2 and go straight to **Wayback → relocated-content search**.

No single URL failure fails the whole investigation; fact extraction simply has fewer sources for that URL.

## Optional: disable HTTP/2 in Playwright

If you see many **tier2_playwright_error** with `ERR_HTTP2_PROTOCOL_ERROR`, you can try launching Chromium with HTTP/2 disabled so it uses HTTP/1.1. This is **optional** and not guaranteed to fix all cases.

In `.env` (or your config), set:

```bash
# Optional: try to reduce ERR_HTTP2_PROTOCOL_ERROR in Playwright (Chromium)
PLAYWRIGHT_DISABLE_HTTP2=true
```

The Tier 2 fetcher reads this and launches Chromium with `--disable-http2`. Some servers still serve HTTP/2 or block headless clients; in those cases the URL may remain inaccessible.

## Summary

- **dead_url_*** and **domain_dns_failed** → Recovery was attempted (Wayback / relocated content); success is logged as above.
- **web_fetch_error** / **tier2_playwright_error** → Tiered fallback was used; if all tiers fail, the URL is stored as inaccessible and the run continues.
- To reduce HTTP/2 errors in Playwright, set **PLAYWRIGHT_DISABLE_HTTP2=true** and ensure your fetcher reads it when launching the browser.
