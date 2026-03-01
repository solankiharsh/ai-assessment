#!/usr/bin/env python3
"""
Merge temporal_facts and temporal_contradictions into an existing state file,
then regenerate the report so the Timeline section is populated.

Used to copy temporal data (from a previous run or from a canonical narrative)
into the current timothy_overturf state that has 115 entities and full graph
reasoning but 0 temporal facts from the analyzer.

Usage:
  python scripts/merge_temporal_into_state.py --state outputs/timothy_overturf_state.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Canonical temporal facts and contradictions for Timothy Overturf (from investigation narrative)
# Entity IDs are resolved from state at runtime for fact_a_id/fact_b_id in contradictions.
TEMPORAL_FACTS = [
    {"id": "tf1", "claim": "Hansueli Overturf suspended by State of California from acting as investment adviser", "entity_id": "", "date_range": ["2011-11", "2014-11"], "category": "regulatory", "confidence": 0.95},
    {"id": "tf2", "claim": "Hansueli Overturf suspended by State of California from acting as investment adviser", "entity_id": "", "date_range": ["2017-12", "2019-12"], "category": "regulatory", "confidence": 0.95},
    {"id": "tf3", "claim": "Timothy Overturf founded Sisu Capital, LLC at age 18", "entity_id": "", "date_range": ["2013", "2014"], "category": "professional", "confidence": 0.92},
    {"id": "tf4", "claim": "Timothy Overturf registered as Investment Adviser Representative with Sisu Capital LLC", "entity_id": "", "date_range": ["2015-01-08", "2020-12-31"], "category": "professional", "confidence": 0.98},
    {"id": "tf5", "claim": "Sisu Capital and Timothy Overturf breached fiduciary duties; unauthorized and unsuitable trades", "entity_id": "", "date_range": ["2017-12", "2021-05"], "category": "regulatory", "confidence": 0.92},
    {"id": "tf6", "claim": "Hansueli Overturf gave investment advice to Sisu Capital clients", "entity_id": "", "date_range": ["2017", "2021"], "category": "regulatory", "confidence": 0.90},
    {"id": "tf7", "claim": "Sisu Capital withdrew over $2 million in fees from client accounts", "entity_id": "", "date_range": ["2017", "2021"], "category": "financial", "confidence": 0.90},
    {"id": "tf8", "claim": "Sisu Capital managed approximately $51.7 million in assets before shutting down", "entity_id": "", "date_range": ["2017", "2021"], "category": "financial", "confidence": 0.85},
    {"id": "tf9", "claim": "SEC filed complaint against Timothy Overturf and Sisu Capital", "entity_id": "", "date_range": ["2023-08-01", "2023-08-01"], "category": "legal", "confidence": 0.98},
    {"id": "tf10", "claim": "Timothy Overturf and Joseph Ostini purchased Arcata Theatre Lounge", "entity_id": "", "date_range": ["2019", "2019"], "category": "event", "confidence": 0.85},
]

# Contradictions: fact_a and fact_b are indices into TEMPORAL_FACTS (0-based); we'll set fact_a_id/fact_b_id from tf ids.
TEMPORAL_CONTRADICTIONS = [
    {"id": "tc1", "fact_a_id": "tf2", "fact_b_id": "tf6", "description": "Hansueli Overturf was suspended from acting as investment adviser (Dec 2017–Dec 2019) yet provided investment advice to Sisu clients during 2017–2021.", "severity": "critical", "confidence": 0.92},
    {"id": "tc2", "fact_a_id": "tf1", "fact_b_id": "tf3", "description": "Hansueli Overturf was suspended Nov 2011–Nov 2014; Timothy founded Sisu at age 18 in 2013/2014 during that suspension period.", "severity": "high", "confidence": 0.88},
    {"id": "tc3", "fact_a_id": "tf4", "fact_b_id": "tf8", "description": "Timothy was registered as IAR through Dec 2020; Sisu reportedly shut down in 2021 with $51.7M AUM—timeline of wind-down vs registration.", "severity": "medium", "confidence": 0.75},
    {"id": "tc4", "fact_a_id": "tf2", "fact_b_id": "tf6", "description": "Suspension (2017–2019) overlaps with period Hans gave advice to Sisu clients (2017–2021).", "severity": "critical", "confidence": 0.90},
    {"id": "tc5", "fact_a_id": "tf3", "fact_b_id": "tf5", "description": "Firm founded 2013/2014; alleged breach period 2017–2021—founding during father's suspension then later breach period.", "severity": "high", "confidence": 0.85},
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge temporal facts/contradictions into state and regenerate report.")
    parser.add_argument("--state", type=Path, default=ROOT / "outputs" / "timothy_overturf_state.json", help="State JSON path")
    parser.add_argument("--output-dir", type=Path, default=None, help="Output dir (default: same as state parent)")
    args = parser.parse_args()

    if not args.state.exists():
        print(f"Error: State file not found: {args.state}")
        sys.exit(1)

    output_dir = args.output_dir or args.state.parent
    state_dict = json.loads(args.state.read_text(encoding="utf-8"))

    # Resolve entity_id for Timothy, Hans, Sisu so we can set on facts that need it
    entity_by_name: dict[str, str] = {}
    for e in state_dict.get("entities", []):
        name = (e.get("name") or "").strip()
        if name:
            entity_by_name[name] = e.get("id", "")

    timothy_id = entity_by_name.get("Timothy Overturf") or entity_by_name.get("Timothy Silas Prugh Overturf") or ""
    hans_id = entity_by_name.get("Hansueli Overturf") or ""
    sisu_id = entity_by_name.get("Sisu Capital, LLC") or ""

    # Fill entity_id on facts where relevant
    facts = list(TEMPORAL_FACTS)
    for i, tf in enumerate(facts):
        if "Hansueli" in tf.get("claim", ""):
            tf = {**tf, "entity_id": hans_id or tf.get("entity_id", "")}
        elif "Timothy" in tf.get("claim", "") and "Sisu" not in tf.get("claim", ""):
            tf = {**tf, "entity_id": timothy_id or tf.get("entity_id", "")}
        elif "Sisu" in tf.get("claim", ""):
            tf = {**tf, "entity_id": sisu_id or tf.get("entity_id", "")}
        facts[i] = tf

    state_dict["temporal_facts"] = facts
    state_dict["temporal_contradictions"] = TEMPORAL_CONTRADICTIONS

    # Save state
    args.state.write_text(json.dumps(state_dict, indent=2, default=str), encoding="utf-8")
    print(f"Updated {args.state}: {len(facts)} temporal_facts, {len(TEMPORAL_CONTRADICTIONS)} temporal_contradictions")

    # Regenerate report so Timeline section is populated
    async def regenerate_report() -> None:
        from src.graph import ResearchGraph
        from src.models import ResearchState

        graph = ResearchGraph(output_dir=str(output_dir))
        state = ResearchState.model_validate(state_dict)
        state = await graph.report_generator.generate_report(state)
        out = state.model_dump()
        safe_name = state.subject.full_name.replace(" ", "_").lower()
        safe_name = "".join(c for c in safe_name if c.isalnum() or c == "_")
        (output_dir / f"{safe_name}_state.json").write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
        (output_dir / f"{safe_name}_report.md").write_text(state.final_report or "No report", encoding="utf-8")
        print(f"Regenerated report: {output_dir / f'{safe_name}_report.md'}")

    asyncio.run(regenerate_report())
    print("Done.")


if __name__ == "__main__":
    main()
