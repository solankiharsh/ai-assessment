#!/usr/bin/env python3
"""
Check that API keys from .env are valid and working.

Loads .env from the project root (parent of scripts/), then runs a minimal
request against each configured provider. Use this before running the agent
to avoid "Expired Key" or "401 Unauthorized" errors mid-investigation.

If LITELLM_API_KEY is set in .env, all LLM calls go through the LiteLLM proxy;
  no direct ANTHROPIC/OPENAI/GOOGLE keys are needed in the app. Otherwise the app
  uses direct provider keys. "Expired Key" / director_planning_error: fix the key
  used by the Director (LiteLLM proxy key or ANTHROPIC_API_KEY/OPENAI_API_KEY).

Usage:
    python scripts/check_env.py
    # or from project root:
    python -m scripts.check_env
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Project root = parent of scripts/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"


ENV_KEYS = (
    "LITELLM_API_KEY",
    "LITELLM_API_BASE",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "TAVILY_API_KEY",
    "BRAVE_SEARCH_API_KEY",
)


def load_env() -> bool:
    """Load .env into os.environ (override=True so we test keys from .env). Returns True if file exists."""
    if not ENV_FILE.exists():
        print(f"[FAIL] No .env found at {ENV_FILE}")
        return False
    in_shell = [k for k in ENV_KEYS if os.environ.get(k)]
    if in_shell:
        print("[WARN] These are set in your shell and override .env when you run the pipeline:")
        for k in in_shell:
            print(f"       {k}")
        print("       To use .env instead, run: unset " + " ".join(in_shell))
        print()
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE, override=True)
    except ImportError:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip()
                if key and value:
                    os.environ[key] = value
    return True


def mask(key: str) -> str:
    """Mask key for display."""
    val = os.environ.get(key, "")
    if not val or len(val) < 8:
        return "(not set)" if not val else "(too short)"
    return f"{val[:6]}...{val[-4:]}"


async def check_litellm() -> tuple[bool, str]:
    """Test LITELLM_API_KEY against the LiteLLM proxy (OpenAI-compatible /v1/chat/completions)."""
    key = os.environ.get("LITELLM_API_KEY", "").strip()
    if not key:
        return False, "LITELLM_API_KEY not set"
    base = (os.environ.get("LITELLM_API_BASE", "") or "http://localhost:4000").strip().rstrip("/")
    url = f"{base}/v1/chat/completions"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-3.5-turbo",
                    "max_tokens": 5,
                    "messages": [{"role": "user", "content": "Say OK"}],
                },
            )
            if r.status_code == 200:
                return True, "OK"
            if r.status_code == 401:
                return False, "Invalid or expired key (401)"
            if r.status_code == 429:
                return False, "Rate limited (429)"
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


async def check_anthropic() -> tuple[bool, str]:
    """Test ANTHROPIC_API_KEY with a minimal messages request."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return False, "ANTHROPIC_API_KEY not set"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-3-5-haiku-20241022",
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "Say OK"}],
                },
            )
            if r.status_code == 200:
                return True, "OK"
            if r.status_code == 401:
                return False, "Invalid or expired key (401)"
            if r.status_code == 429:
                return False, "Rate limited (429)"
            if r.status_code == 404:
                # Model ID may be deprecated; key is valid if we got 404 not 401
                return True, "OK (key valid; model ID may differ)"
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


async def check_openai() -> tuple[bool, str]:
    """Test OPENAI_API_KEY with a minimal chat completion."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return False, "OPENAI_API_KEY not set"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "max_tokens": 5,
                    "messages": [{"role": "user", "content": "Say OK"}],
                },
            )
            if r.status_code == 200:
                return True, "OK"
            if r.status_code == 401:
                return False, "Invalid or expired key (401)"
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            err = body.get("error", {})
            msg = err.get("message", r.text[:200])
            if r.status_code == 400 and "expired" in msg.lower():
                return False, "Key expired — create a new key at platform.openai.com"
            return False, f"HTTP {r.status_code}: {msg}"
    except Exception as e:
        return False, str(e)


async def check_google() -> tuple[bool, str]:
    """Test GOOGLE_API_KEY with a minimal generateContent call."""
    key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not key:
        return False, "GOOGLE_API_KEY not set"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}",
                json={"contents": [{"parts": [{"text": "Say OK"}]}], "generationConfig": {"maxOutputTokens": 5}},
            )
            if r.status_code == 200:
                return True, "OK"
            if r.status_code == 403:
                return False, "Invalid key or API not enabled (403)"
            if r.status_code == 401:
                return False, "Invalid or expired key (401)"
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


async def check_tavily() -> tuple[bool, str]:
    """Test TAVILY_API_KEY with a minimal search."""
    key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not key:
        return False, "TAVILY_API_KEY not set"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": "test", "max_results": 1},
            )
            if r.status_code == 200:
                return True, "OK"
            if r.status_code == 401:
                return False, "Invalid key (401 Unauthorized)"
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


async def check_brave() -> tuple[bool, str]:
    """Test BRAVE_SEARCH_API_KEY with a minimal web search."""
    key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
    if not key:
        return False, "BRAVE_SEARCH_API_KEY not set"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={"X-Subscription-Token": key, "Accept": "application/json"},
                params={"q": "test", "count": 1},
            )
            if r.status_code == 200:
                return True, "OK"
            if r.status_code in (401, 403):
                return False, "Invalid key (401/403)"
            if r.status_code == 422:
                return False, "Invalid key or subscription (422)"
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


def warn_duplicate_keys_in_env() -> None:
    """Warn if any ENV_KEYS appear more than once in .env (last occurrence wins with dotenv)."""
    if not ENV_FILE.exists():
        return
    seen: dict[str, list[int]] = {}
    with open(ENV_FILE) as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key = line.partition("=")[0].strip()
            if key in ENV_KEYS:
                seen.setdefault(key, []).append(i)
    dupes = {k: v for k, v in seen.items() if len(v) > 1}
    if dupes:
        print("[WARN] Duplicate keys in .env (the last value wins; remove duplicates to avoid using an old key):")
        for k, lines in dupes.items():
            print(f"       {k} on lines {lines}")
        print()


async def main() -> int:
    print("Loading .env from", ENV_FILE)
    warn_duplicate_keys_in_env()
    if not load_env():
        return 1

    print()
    litellm_key = os.environ.get("LITELLM_API_KEY", "").strip()
    if litellm_key:
        checks = [
            ("LITELLM_API_KEY (all models via proxy)", mask("LITELLM_API_KEY"), check_litellm),
            ("TAVILY_API_KEY (Search)", mask("TAVILY_API_KEY"), check_tavily),
            ("BRAVE_SEARCH_API_KEY (Search fallback)", mask("BRAVE_SEARCH_API_KEY"), check_brave),
        ]
    else:
        checks = [
            ("ANTHROPIC_API_KEY (Claude / Director)", mask("ANTHROPIC_API_KEY"), check_anthropic),
            ("OPENAI_API_KEY (GPT / Fact extraction)", mask("OPENAI_API_KEY"), check_openai),
            ("GOOGLE_API_KEY (Gemini)", mask("GOOGLE_API_KEY"), check_google),
            ("TAVILY_API_KEY (Search)", mask("TAVILY_API_KEY"), check_tavily),
            ("BRAVE_SEARCH_API_KEY (Search fallback)", mask("BRAVE_SEARCH_API_KEY"), check_brave),
        ]

    failed = 0
    for name, masked, coro in checks:
        ok, msg = await coro()
        status = "[OK]  " if ok else "[FAIL]"
        if not ok:
            failed += 1
        print(f"  {status} {name}")
        print(f"         Key: {masked}")
        if not ok:
            print(f"         → {msg}")
        print()

    if failed:
        print("Fix the failing keys above (e.g. create new keys, enable APIs).")
        print("Then run: python scripts/check_env.py")
        return 1
    print("All configured keys are valid.")
    print("If the pipeline reports 'Expired Key' with param ...44da: the backend is using a key ending in 44da.")
    print("  → Open .env (and .env.local if present); search for '44da'. Remove duplicate OPENAI_API_KEY lines and keep only a valid key from platform.openai.com.")
    return 0


if __name__ == "__main__":
    try:
        import httpx
    except ImportError:
        print("Install httpx: pip install httpx")
        sys.exit(1)
    sys.exit(asyncio.run(main()))
