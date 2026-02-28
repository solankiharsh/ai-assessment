#!/usr/bin/env python3
"""
Push Deep Research Agent prompt templates to LangSmith via the API.

Uses the LangSmith Python SDK (Client.push_prompt) to create or update prompts
in your LangSmith project. Requires LANGCHAIN_API_KEY (and optionally
LANGCHAIN_PROJECT) in .env.

Usage:
    uv run python scripts/push_prompts_to_langsmith.py
    uv run python scripts/push_prompts_to_langsmith.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Repo root for .env and src imports (must run from repo root or have path set)
_repo_root = Path(__file__).resolve().parent.parent
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

if (_repo_root / ".env").exists():
    from dotenv import load_dotenv
    load_dotenv(_repo_root / ".env", override=True)

from langchain_core.prompts import ChatPromptTemplate
from langsmith import Client

# Import after env load so config sees LANGCHAIN_API_KEY
from src.prompts import templates as t


PROMPTS = [
    (
        "research-director",
        "Research Director: plans next investigation step (phase, queries, next_action).",
        t.RESEARCH_DIRECTOR_SYSTEM,
        t.RESEARCH_DIRECTOR_USER_TEMPLATE,
    ),
    (
        "fact-extractor",
        "Fact Extraction: structured entities and facts from web content.",
        t.FACT_EXTRACTOR_SYSTEM,
        t.FACT_EXTRACTOR_USER_TEMPLATE,
    ),
    (
        "risk-proponent",
        "Risk Proponent: argues why findings are concerning (adversarial).",
        t.RISK_PROPONENT_SYSTEM,
        t.RISK_PROPONENT_USER_TEMPLATE,
    ),
    (
        "risk-skeptic",
        "Risk Skeptic: argues why findings are explainable or benign.",
        t.RISK_SKEPTIC_SYSTEM,
        t.RISK_SKEPTIC_USER_TEMPLATE,
    ),
    (
        "risk-analyzer",
        "Risk Analyzer (judge): flags risks, severity, categories from debate.",
        t.RISK_ANALYZER_SYSTEM,
        t.RISK_ANALYZER_USER_TEMPLATE,
    ),
    (
        "connection-mapper",
        "Connection Mapping: relationships between entities (WORKS_AT, FOUNDED, etc.).",
        t.CONNECTION_MAPPER_SYSTEM,
        t.CONNECTION_MAPPER_USER_TEMPLATE,
    ),
    (
        "source-verifier",
        "Source Verification: confidence scores and claim verification.",
        t.SOURCE_VERIFIER_SYSTEM,
        t.SOURCE_VERIFIER_USER_TEMPLATE,
    ),
    (
        "report-generator",
        "Report Generator: due diligence report from investigation state.",
        t.REPORT_GENERATOR_SYSTEM,
        t.REPORT_GENERATOR_USER_TEMPLATE,
    ),
    (
        "temporal-analyzer",
        "Temporal Analysis: timeline, date ranges, contradictions.",
        t.TEMPORAL_ANALYZER_SYSTEM,
        t.TEMPORAL_ANALYZER_USER_TEMPLATE,
    ),
    (
        "entity-resolver",
        "Entity Resolution: merge duplicate entities.",
        t.ENTITY_RESOLVER_SYSTEM,
        t.ENTITY_RESOLVER_USER_TEMPLATE,
    ),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Push agent prompts to LangSmith")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be pushed without calling the API",
    )
    parser.add_argument(
        "--prefix",
        default="",
        help="Optional prompt identifier prefix (e.g. my-org). If unset, prompts use plain names so they are created in your own LangSmith workspace.",
    )
    args = parser.parse_args()

    if not os.environ.get("LANGCHAIN_API_KEY", "").strip():
        print("Error: LANGCHAIN_API_KEY is not set. Add it to .env and try again.", file=sys.stderr)
        return 1

    for name, description, system_text, user_text in PROMPTS:
        prompt_id = f"{args.prefix}/{name}" if args.prefix else name
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_text),
            ("human", user_text),
        ])
        if args.dry_run:
            print(f"[dry-run] Would push: {prompt_id}")
            print(f"  Description: {description[:60]}...")
            continue
        try:
            client = Client()
            url = client.push_prompt(
                prompt_id,
                object=prompt,
                description=description,
                tags=["deep-research-agent", "agent-prompts"],
            )
            print(f"Pushed: {prompt_id} -> {url}")
        except Exception as e:
            print(f"Failed {prompt_id}: {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
