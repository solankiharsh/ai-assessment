#!/usr/bin/env python3
"""
Run only the synthesis phase (entity resolution → temporal → update_graph_db → graph_reasoning → report)
for an existing investigation state. Uses graph-scoped Neo4j driver lifecycle.

Usage:
  python scripts/run_synthesis_only.py [--state PATH] [--output DIR]
  Default: --state outputs/timothy_overturf_state.json --output outputs
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Project root
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.graph import ResearchGraph
from src.models import ResearchState


def main() -> None:
    parser = argparse.ArgumentParser(description="Run synthesis phase only for a saved investigation state.")
    parser.add_argument(
        "--state",
        type=Path,
        default=ROOT / "outputs" / "timothy_overturf_state.json",
        help="Path to _state.json file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "outputs",
        help="Output directory for updated state and report",
    )
    args = parser.parse_args()

    if not args.state.exists():
        print(f"Error: State file not found: {args.state}")
        sys.exit(1)

    state_dict = json.loads(args.state.read_text(encoding="utf-8"))
    # Reconstruct ResearchState (Pydantic coerces enums from strings)
    try:
        state = ResearchState.model_validate(state_dict)
    except Exception as e:
        print(f"Error: Invalid state file: {e}")
        sys.exit(1)

    async def run() -> None:
        graph = ResearchGraph(output_dir=str(args.output))
        print("Running synthesis phase (entity_resolution → temporal → update_graph_db → graph_reasoning → report)...")
        out_dict = await graph._synthesis_node(state.model_dump())
        result = ResearchState.model_validate(out_dict)

        args.output.mkdir(parents=True, exist_ok=True)
        safe_name = result.subject.full_name.replace(" ", "_").lower()
        safe_name = "".join(c for c in safe_name if c.isalnum() or c == "_")

        (args.output / f"{safe_name}_state.json").write_text(
            json.dumps(out_dict, indent=2, default=str), encoding="utf-8"
        )
        (args.output / f"{safe_name}_report.md").write_text(result.final_report or "No report", encoding="utf-8")
        entities_data = [
            {
                "name": e.name,
                "type": e.entity_type.value,
                "confidence": e.confidence,
                "attributes": e.attributes,
                "sources": e.source_urls,
            }
            for e in result.entities
        ]
        (args.output / f"{safe_name}_entities.json").write_text(
            json.dumps(entities_data, indent=2, default=str), encoding="utf-8"
        )
        if result.redacted_report:
            (args.output / f"{safe_name}_report_redacted.md").write_text(result.redacted_report, encoding="utf-8")
        print(f"Done. Updated {args.output}/ ({safe_name}_state.json, _report.md, _entities.json)")

    asyncio.run(run())


if __name__ == "__main__":
    main()
