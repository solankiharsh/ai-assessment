#!/usr/bin/env python3
"""
Test fact_extractor JSON parsing in isolation.
Run: python scripts/test_fact_extractor_parse.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Truncation cases that failed in production
TRUNCATED_KEY = r'''```json
{
  "entities": [
    {
      "name": "Timothy Overturf",
      "entity_type": "Person",
      "attributes": {
        "full_name": "Timothy Overturf",
        "age": "23",
        "title/role'''

TRUNCATED_ARRAY_VAL = r'''```json
{
  "entities": [
    {
      "name": "Timothy Overturf",
      "entity_type": "Person",
      "attributes": {
        "full_name": "Timothy Overturf",
        "title_role": [
          "Owner'''

TRUNCATED_STRING_VAL = r'''```json
{
  "entities": [
    {
      "name": "Sisu Investment Corporation",
      "entity_type": "ORGANIZATION",
      "attributes": {
        "type": "Investment firm",
        "location": "Oakville'''

# Valid JSON wrapped in markdown (should parse successfully after strip)
VALID_WRAPPED = '''```json
{
  "entities": [
    {"name": "Hansueli Overturf", "entity_type": "person", "attributes": {"full_name": "Hansueli Overturf", "aliases": ["Hans Overturf"]}}
  ],
  "connections": [],
  "key_facts": []
}
```'''


def run_real_parser(raw: str) -> dict:
    """Use the real FactExtractionAgent._parse_json."""
    from src.agents.fact_extractor import FactExtractionAgent
    from src.llm_client import LLMClient
    agent = FactExtractionAgent(LLMClient())
    return agent._parse_json(raw)


def main() -> int:
    failed = 0
    for name, raw in [
        ("valid_wrapped_in_markdown", VALID_WRAPPED),
        ("truncated_key", TRUNCATED_KEY),
        ("truncated_array_val", TRUNCATED_ARRAY_VAL),
        ("truncated_string_val", TRUNCATED_STRING_VAL),
    ]:
        print(f"--- {name} ---")
        result = run_real_parser(raw)
        if "error" in result:
            print("ERROR:", result["error"])
            failed += 1
        elif result.get("entities"):
            print("OK entities:", len(result["entities"]), result["entities"][0].get("name"))
        else:
            print("OK (no entities)")
        print()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
