"""
Fact Extraction Agent — turns raw web content into structured entities.

Uses GPT-4.1 for structured extraction. Processes pending_content and
produces Entity and Connection objects; uses fuzzy entity dedup when configured.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

try:
    from json_repair import repair_json as _repair_json
    _HAS_JSON_REPAIR = True
except ImportError:
    _HAS_JSON_REPAIR = False

from src.config import get_settings
from src.llm_client import LLMClient, ModelTask, ModelTier
from src.models import (
    ConfidenceScore,
    Connection,
    Entity,
    EntityType,
    RelationshipType,
    ResearchState,
    SourceReference,
)
from src.prompts.templates import (
    FACT_EXTRACTOR_SYSTEM,
    FACT_EXTRACTOR_USER_TEMPLATE,
)

logger = structlog.get_logger()


class FactExtractionAgent:
    """Extracts structured entities and facts from raw web content."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm = llm_client
        self.tier = ModelTier.FAST
        self.task = ModelTask.FACT_EXTRACTION

    async def extract_facts(self, state: ResearchState) -> ResearchState:
        """Process pending content → entities + connections; record iteration yield."""
        if not state.pending_content:
            logger.info("fact_extraction_no_content")
            state.record_iteration_yield(0, 0)
            return state

        settings = get_settings()
        fuzzy = settings.agent.entity_fuzzy_threshold if settings.agent.entity_fuzzy_threshold > 0 else None

        batches = self._batch_content(state.pending_content)
        known_str = self._format_known_entities(state)
        total_ne, total_nc, total_nf = 0, 0, 0
        num_batches = len(batches)
        num_items = len(state.pending_content)

        # Resolve the model once so we can surface its name in the start log
        from src.llm_client import _model_name_from, _is_reasoning_model
        _model = self.llm.get_model_by_tier(self.tier)
        _model_name = _model_name_from(_model)
        _reasoning = _is_reasoning_model(_model)

        logger.info(
            "fact_extraction_started",
            iteration=state.iteration,
            phase=state.current_phase,
            num_results=num_items,
            num_batches=num_batches,
            model=_model_name,
            reasoning_model=_reasoning,
            json_mode="disabled (reasoning model)" if _reasoning else "enabled",
        )

        for batch_idx, batch in enumerate(batches, start=1):
            batch_queries = list({item.get("query", "") for item in batch if item.get("query")})
            batch_sources = [item.get("url", "")[:80] for item in batch]
            batch_chars = sum(
                len(item.get("raw_content") or item.get("snippet", "")) for item in batch
            )
            logger.debug(
                "fact_extraction_batch_start",
                batch=f"{batch_idx}/{num_batches}",
                items=len(batch),
                chars=batch_chars,
                queries=batch_queries,
                sources=batch_sources,
            )
            try:
                content_str = "\n\n---\n\n".join(
                    f"Source: {item['url']}\nTitle: {item['title']}\n"
                    f"{item.get('raw_content') or item.get('snippet', '')}"
                    for item in batch
                )
                user_prompt = FACT_EXTRACTOR_USER_TEMPLATE.format(
                    subject_name=state.subject.full_name,
                    query=batch[0].get("query", ""),
                    content=content_str[:8000],
                    known_entities=known_str,
                )
                raw = await self.llm.generate_for_task(
                    task=self.task,
                    system_prompt=FACT_EXTRACTOR_SYSTEM,
                    user_prompt=user_prompt,
                    json_mode=True,
                )
                state.total_llm_calls += 1
                extraction = self._parse_json(raw)
                ne, nc, nf = self._merge_into_state(state, extraction, fuzzy_threshold=fuzzy)
                total_ne += ne
                total_nc += nc
                total_nf += nf
                logger.debug(
                    "fact_extraction_batch_done",
                    batch=f"{batch_idx}/{num_batches}",
                    new_entities=ne,
                    new_connections=nc,
                    new_facts=nf,
                    running_totals=f"e={total_ne} c={total_nc} f={total_nf}",
                )
            except Exception as e:
                logger.error(
                    "fact_extraction_error",
                    batch=f"{batch_idx}/{num_batches}",
                    sources=batch_sources,
                    error=str(e),
                )
                state.error_log.append(f"Fact extraction batch {batch_idx}/{num_batches}: {e}")

        state.pending_content = []
        state.record_iteration_yield(total_ne, total_nf)
        logger.info(
            "fact_extraction_done",
            iteration=state.iteration,
            num_batches=num_batches,
            new_entities=total_ne,
            new_connections=total_nc,
            new_facts=total_nf,
        )
        return state

    def _batch_content(self, content: list[dict], max_chars: int = 6000) -> list[list[dict]]:
        batches, batch, size = [], [], 0
        for item in content:
            item_size = len(item.get("raw_content") or item.get("snippet", ""))
            if size + item_size > max_chars and batch:
                batches.append(batch)
                batch, size = [], 0
            batch.append(item)
            size += item_size
        if batch:
            batches.append(batch)
        return batches

    def _format_known_entities(self, state: ResearchState) -> str:
        if not state.entities:
            return "(None)"
        return "\n".join(f"- [{e.entity_type.value}] {e.name}" for e in state.entities[:20])

    def _sanitize_json(self, text: str) -> str:
        """Fix common LLM JSON errors (trailing commas, comments, NaN/Infinity) so json.loads() succeeds."""
        # Remove whole-line and trailing // comments (conservative: avoids mangling URL strings
        # that contain // because those are inside double-quoted values)
        text = re.sub(r"(?m)^\s*//.*$", "", text)
        text = re.sub(r",\s*//[^\n]*", ",", text)
        # Remove trailing commas before } or ] (the most common LLM mistake)
        text = re.sub(r",\s*([}\]])", r"\1", text)
        # Replace JSON-invalid number literals with null
        text = re.sub(r"\bNaN\b", "null", text)
        text = re.sub(r"-?Infinity\b", "null", text)
        return text

    def _strip_json_fences(self, raw: str) -> str:
        """Remove markdown code fences so we get raw JSON. Tries multiple patterns."""
        cleaned = raw.strip()
        # Strip leading ```json or ``` (with optional whitespace/newlines)
        cleaned = re.sub(r"^\s*```(?:json)?\s*\n?", "", cleaned)
        # Strip trailing ``` and anything after (trailing garbage)
        if "```" in cleaned:
            cleaned = cleaned.split("```")[0]
        cleaned = cleaned.strip()
        # If model literally followed "start with {{" / "end with }}" from prompt, normalize to single braces
        if cleaned.startswith("{{"):
            cleaned = "{" + cleaned[2:]
        if cleaned.endswith("}}"):
            cleaned = cleaned[:-2] + "}"
        return cleaned

    def _parse_json(self, raw: str) -> dict[str, Any]:
        empty = {"entities": [], "connections": [], "key_facts": []}
        cleaned = self._strip_json_fences(raw)
        # Attempt 1: direct parse (model often returns valid JSON after fence strip)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        # Attempt 2: sanitize common LLM errors (trailing commas, comments, NaN) then retry
        sanitized = self._sanitize_json(cleaned)
        try:
            return json.loads(sanitized)
        except json.JSONDecodeError:
            pass
        # Use sanitized text for all subsequent repair attempts so the brace-stack
        # repair also benefits from having trailing commas already removed.
        cleaned = sanitized
        # Find first { and matching closing } using a stack (handles nested {} and []).
        start = cleaned.find("{")
        if start < 0:
            logger.warning(
                "json_parse_failed",
                preview=raw[:200],
                reason="no_open_brace",
            )
            return empty
        stack: list[str] = []
        in_string = False
        escape = False
        end = -1
        i = start
        while i < len(cleaned):
            c = cleaned[i]
            if escape:
                escape = False
                i += 1
                continue
            if c == "\\" and in_string:
                escape = True
                i += 1
                continue
            if c == '"' and not in_string:
                in_string = True
                i += 1
                continue
            if c == '"' and in_string:
                in_string = False
                i += 1
                continue
            if in_string:
                i += 1
                continue
            if c == "{":
                stack.append("}")
                i += 1
            elif c == "[":
                stack.append("]")
                i += 1
            elif c == "}" or c == "]":
                if not stack or stack[-1] != c:
                    break
                stack.pop()
                if not stack:
                    end = i + 1
                    break
                i += 1
            else:
                i += 1
        if end > start:
            cleaned = cleaned[start:end]
        else:
            suffix = "".join(reversed(stack))
            if in_string:
                for extra in ('"', '": ""'):
                    try:
                        return json.loads(cleaned + extra + suffix)
                    except json.JSONDecodeError:
                        continue
                cleaned = cleaned + '"' + suffix
            else:
                cleaned = cleaned + suffix
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            for suffix in ("]", "}", "]}", "}]}", "}]}]}"):
                try:
                    return json.loads(cleaned + suffix)
                except json.JSONDecodeError:
                    continue
            # Last resort: use json-repair which handles trailing commas, truncation,
            # and other LLM JSON quirks that simple regexes can miss.
            if _HAS_JSON_REPAIR:
                try:
                    repaired = _repair_json(cleaned, return_objects=True)
                    if isinstance(repaired, dict):
                        logger.debug(
                            "json_repaired",
                            preview=raw[:100],
                            original_error=str(e),
                        )
                        return repaired
                except Exception:
                    pass
            logger.warning(
                "json_parse_failed",
                preview=raw[:200],
                decode_error=str(e),
                position=getattr(e, "pos", None),
            )
            return empty

    def _merge_into_state(
        self,
        state: ResearchState,
        data: dict,
        fuzzy_threshold: float | None = None,
    ) -> tuple[int, int, int]:
        """Returns (new_entities, new_connections, new_facts)."""
        type_map = {t.value: t for t in EntityType}
        rel_map = {r.value: r for r in RelationshipType}
        ne = nc = nf = 0

        for raw in data.get("entities") or []:
            name = (raw.get("name") or "").strip()
            if not name or len(name) < 2:
                continue
            etype_str = raw.get("entity_type")
            if not isinstance(etype_str, str):
                etype_str = "person"
            etype_str = etype_str.lower()
            etype = type_map.get(etype_str, EntityType.PERSON)
            src = raw.get("source_url") or ""
            entity = Entity(
                name=name,
                entity_type=etype,
                attributes=raw.get("attributes") or {},
                source_urls=[src] if src else [],
                confidence=float(raw.get("confidence") or 0.5),
                first_seen_iteration=state.iteration,
            )
            # Compute confidence detail from source authority
            authority = 0.5
            if src:
                src_domain = src.split("/")[2] if src.startswith("http") and "/" in src else ""
                ref = SourceReference(url=src, domain=src_domain)
                authority = ref.compute_authority()
            entity.confidence_detail = ConfidenceScore(
                source_authority=authority,
                corroboration_count=len(entity.source_urls),
                recency_score=0.5,
                internal_consistency=float(raw.get("confidence") or 0.5),
                extraction_clarity=float(raw.get("confidence") or 0.5),
            )
            before = len(state.entities)
            state.add_entity(entity, fuzzy_threshold=fuzzy_threshold)
            if len(state.entities) > before:
                ne += 1

        for raw in data.get("connections") or []:
            src_name = raw.get("source") if raw.get("source") is not None else ""
            tgt_name = raw.get("target") if raw.get("target") is not None else ""
            src_e = state.find_entity_by_name(src_name)
            if not src_e and fuzzy_threshold:
                src_e = state.find_entity_by_name_fuzzy(src_name, fuzzy_threshold)
            tgt_e = state.find_entity_by_name(tgt_name)
            if not tgt_e and fuzzy_threshold:
                tgt_e = state.find_entity_by_name_fuzzy(tgt_name, fuzzy_threshold)
            if not src_e or not tgt_e:
                continue
            rel_str = raw.get("relationship")
            if not isinstance(rel_str, str):
                rel_str = "RELATED_TO"
            rel = rel_map.get(rel_str.upper(), RelationshipType.RELATED_TO)
            state.add_connection(
                Connection(
                    source_entity_id=src_e.id,
                    target_entity_id=tgt_e.id,
                    relationship_type=rel,
                    description=raw.get("description") or "",
                    confidence=float(raw.get("confidence") or 0.5),
                    source_urls=raw.get("source_urls") or [],
                )
            )
            nc += 1

        for fact in data.get("key_facts") or []:
            claim = fact.get("claim") or ""
            if claim and claim not in state.subject.known_associations:
                state.subject.known_associations.append(claim)
                nf += 1

        return ne, nc, nf
