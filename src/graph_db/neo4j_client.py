"""
Neo4j Identity Graph — persists investigation results as a queryable graph.

Schema: Person, Organization, etc. nodes; relationship types; RiskFlag nodes.
Labels and relationship types are allowlisted to prevent Cypher injection.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from neo4j import AsyncDriver, AsyncGraphDatabase

from src.config import get_settings
from src.models import EntityType, ResearchState
from src.observability import metrics as obs_metrics

logger = structlog.get_logger()


def _investigation_id_from_state(state: ResearchState) -> str:
    """Derive a stable investigation ID from subject name for graph provenance."""
    name = (state.subject.full_name or "").strip().lower()
    name = re.sub(r"\s+", "_", re.sub(r"[^a-z0-9\s]", "", name)) or "run"
    return name[:64]

# Allowlisted node labels (Cypher does not support parameterized labels)
VALID_NODE_LABELS = frozenset(
    {
        "Person",
        "Organization",
        "Location",
        "Event",
        "Document",
        "FinancialInstrument",
        "Entity",
        "RiskFlag",
    }
)

# Allowlisted relationship types from our enum
VALID_REL_TYPES = frozenset(
    {
        "WORKS_AT",
        "BOARD_MEMBER_OF",
        "FOUNDED",
        "INVESTED_IN",
        "SUBSIDIARY_OF",
        "RELATED_TO",
        "KNOWS",
        "FAMILY_OF",
        "SUED_BY",
        "REGULATED_BY",
        "MENTIONED_IN",
        "PARTNER_OF",
        "ADVISOR_TO",
        "DONOR_TO",
        "PREVIOUSLY_AT",
        "LOCATED_AT",
        "FLAGGED_FOR",
    }
)


def _safe_label(label: str) -> str:
    """Return label if allowlisted, else Entity."""
    return label if label in VALID_NODE_LABELS else "Entity"


def _safe_rel_type(rel: str) -> str:
    """Return relationship type if allowlisted, else RELATED_TO."""
    return rel if rel in VALID_REL_TYPES else "RELATED_TO"


class Neo4jClient:
    """Async Neo4j client for identity graph operations."""

    def __init__(self) -> None:
        settings = get_settings()
        self._driver: Optional[AsyncDriver] = None
        self._uri = settings.neo4j.uri
        self._username = settings.neo4j.username
        self._password = settings.neo4j.password
        self._database = settings.neo4j.database

    async def connect(self) -> None:
        try:
            self._driver = AsyncGraphDatabase.driver(
                self._uri,
                auth=(self._username, self._password),
            )
            await self._driver.verify_connectivity()
            logger.info("neo4j_connected", uri=self._uri)
        except Exception as e:
            logger.error("neo4j_connection_failed", error=str(e))
            self._driver = None

    async def close(self) -> None:
        if self._driver:
            await self._driver.close()

    @property
    def is_connected(self) -> bool:
        return self._driver is not None

    async def clear_graph(self) -> None:
        if not self.is_connected:
            return
        async with self._driver.session(database=self._database) as session:
            await session.run("MATCH (n) DETACH DELETE n")
            logger.info("neo4j_graph_cleared")

    async def create_constraints(self) -> None:
        if not self.is_connected:
            return
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.entity_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (o:Organization) REQUIRE o.entity_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (e:Event) REQUIRE e.entity_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (r:RiskFlag) REQUIRE r.flag_id IS UNIQUE",
        ]
        async with self._driver.session(database=self._database) as session:
            for cypher in constraints:
                try:
                    await session.run(cypher)
                except Exception as e:
                    logger.debug("constraint_exists", error=str(e))

    async def ensure_indexes(self) -> None:
        """Create indexes on first use for query performance."""
        if not self.is_connected:
            return
        indexes = [
            "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)",
            "CREATE INDEX IF NOT EXISTS FOR (o:Organization) ON (o.name)",
            "CREATE INDEX IF NOT EXISTS FOR (l:Location) ON (l.name)",
            "CREATE INDEX IF NOT EXISTS FOR (rf:RiskFlag) ON (rf.flag_id)",
            "CREATE INDEX IF NOT EXISTS FOR (rf:RiskFlag) ON (rf.severity)",
            "CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.investigation_id)",
            "CREATE INDEX IF NOT EXISTS FOR (n:Organization) ON (n.investigation_id)",
        ]
        async with self._driver.session(database=self._database) as session:
            for cypher in indexes:
                try:
                    await session.run(cypher)
                except Exception as e:
                    logger.debug("index_creation_skipped", cypher=cypher[:50], error=str(e))

    async def persist_state(self, state: ResearchState) -> dict[str, int]:
        """Persist investigation state to Neo4j. Uses allowlisted labels only."""
        if not self.is_connected:
            logger.warning("neo4j_not_connected_skipping_persist")
            return {"nodes": 0, "relationships": 0}

        await self.create_constraints()
        await self.ensure_indexes()
        inv_id = _investigation_id_from_state(state)
        updated_at = datetime.now(timezone.utc).isoformat()
        node_count = 0
        rel_count = 0

        with obs_metrics.track_graph_query("persist_state"):
            async with self._driver.session(database=self._database) as session:
                for entity in state.entities:
                    label = _safe_label(self._entity_type_to_label(entity.entity_type))
                    props = {
                        "entity_id": entity.id,
                        "name": entity.name,
                        "entity_type": entity.entity_type.value,
                        "confidence": entity.confidence,
                        "description": entity.description,
                        "aliases": entity.aliases,
                        "source_urls": entity.source_urls,
                        "investigation_id": inv_id,
                        "updated_at": updated_at,
                        **{k: str(v) for k, v in entity.attributes.items()},
                    }
                    # Label is allowlisted; use parameterized props only
                    cypher = f"MERGE (n:{label} {{entity_id: $entity_id}}) SET n += $props"
                    await session.run(cypher, entity_id=entity.id, props=props)
                    node_count += 1

                for conn in state.connections:
                    src = state.get_entity_by_id(conn.source_entity_id)
                    tgt = state.get_entity_by_id(conn.target_entity_id)
                    if not src or not tgt:
                        continue
                    src_label = _safe_label(self._entity_type_to_label(src.entity_type))
                    tgt_label = _safe_label(self._entity_type_to_label(tgt.entity_type))
                    rel_type = _safe_rel_type(conn.relationship_type.value)
                    cypher = (
                        f"MATCH (a:{src_label} {{entity_id: $src_id}})"
                        f" MATCH (b:{tgt_label} {{entity_id: $tgt_id}})"
                        f" MERGE (a)-[r:{rel_type}]->(b)"
                        " SET r.description = $desc, r.confidence = $conf, r.source_urls = $urls,"
                        " r.investigation_id = $inv_id, r.updated_at = $updated_at"
                    )
                    await session.run(
                        cypher,
                        src_id=conn.source_entity_id,
                        tgt_id=conn.target_entity_id,
                        desc=conn.description,
                        conf=conn.confidence,
                        urls=conn.source_urls,
                        inv_id=inv_id,
                        updated_at=updated_at,
                    )
                    # Edge provenance: temporal and source metadata
                    provenance_cypher = (
                        f"MATCH (a:{src_label} {{entity_id: $src_id}})"
                        f"-[r:{rel_type}]->"
                        f"(b:{tgt_label} {{entity_id: $tgt_id}})"
                        " SET r.extraction_timestamp = $ts,"
                        " r.source_url_primary = $primary_url,"
                        " r.start_date = $start_date,"
                        " r.end_date = $end_date"
                    )
                    await session.run(
                        provenance_cypher,
                        src_id=conn.source_entity_id,
                        tgt_id=conn.target_entity_id,
                        ts=updated_at,
                        primary_url=conn.source_urls[0] if conn.source_urls else "",
                        start_date=conn.start_date or "",
                        end_date=conn.end_date or "",
                    )
                    rel_count += 1

                for flag in state.risk_flags:
                    await session.run(
                        "MERGE (r:RiskFlag {flag_id: $flag_id}) SET r.category = $category, "
                        "r.severity = $severity, r.title = $title, r.description = $description, "
                        "r.confidence = $confidence, r.evidence = $evidence, "
                        "r.investigation_id = $inv_id",
                        flag_id=flag.id,
                        category=flag.category.value,
                        severity=flag.severity.value,
                        title=flag.title,
                        description=flag.description,
                        confidence=flag.confidence,
                        evidence=flag.evidence,
                        inv_id=inv_id,
                    )
                    node_count += 1
                    for eid in flag.entity_ids:
                        entity = state.get_entity_by_id(eid)
                        if entity:
                            label = _safe_label(self._entity_type_to_label(entity.entity_type))
                            link_cypher = (
                                "MATCH (r:RiskFlag {flag_id: $flag_id})"
                                f" MATCH (e:{label} {{entity_id: $entity_id}})"
                                " MERGE (r)-[:FLAGGED_FOR]->(e)"
                            )
                            await session.run(link_cypher, flag_id=flag.id, entity_id=eid)
                            rel_count += 1

        node_counts_by_label: dict[str, int] = {}
        for entity in state.entities:
            label = _safe_label(self._entity_type_to_label(entity.entity_type))
            node_counts_by_label[label] = node_counts_by_label.get(label, 0) + 1
        for _ in state.risk_flags:
            node_counts_by_label["RiskFlag"] = node_counts_by_label.get("RiskFlag", 0) + 1
        edge_counts_by_type: dict[str, int] = {}
        for conn in state.connections:
            rel = _safe_rel_type(conn.relationship_type.value)
            edge_counts_by_type[rel] = edge_counts_by_type.get(rel, 0) + 1
        obs_metrics.record_graph_stats(node_counts_by_label, edge_counts_by_type)

        logger.info(
            "neo4j_persist_complete",
            nodes=node_count,
            relationships=rel_count,
        )
        return {"nodes": node_count, "relationships": rel_count}

    async def query_connections(self, entity_name: str, max_hops: int = 3) -> list[dict[str, Any]]:
        if not self.is_connected:
            return []
        if max_hops < 1 or max_hops > 10:
            max_hops = 3
        cypher = (
            f"MATCH path = (start {{name: $name}})-[*1..{max_hops}]-(connected) "
            "RETURN start.name AS source, "
            "[r IN relationships(path) | type(r)] AS relationship_chain, "
            "[n IN nodes(path) | n.name] AS entity_chain, length(path) AS hops "
            "ORDER BY hops LIMIT 50"
        )
        async with self._driver.session(database=self._database) as session:
            result = await session.run(cypher, name=entity_name)
            return [record.data() async for record in result]

    async def execute_read(self, cypher: str, parameters: Optional[dict[str, Any]] = None) -> list[dict[str, Any]]:
        """Run a read-only parameterized Cypher query; returns list of record dicts."""
        if not self.is_connected:
            return []
        params = parameters or {}
        async with self._driver.session(database=self._database) as session:
            result = await session.run(cypher, params)
            return [record.data() async for record in result]

    async def get_graph_stats(self) -> dict[str, int]:
        if not self.is_connected:
            return {}
        async with self._driver.session(database=self._database) as session:
            node_result = await session.run("MATCH (n) RETURN count(n) AS count")
            node_count = (await node_result.single())["count"]
            rel_result = await session.run("MATCH ()-[r]->() RETURN count(r) AS count")
            rel_count = (await rel_result.single())["count"]
            return {"nodes": node_count, "relationships": rel_count}

    async def shortest_path(self, entity_a: str, entity_b: str, max_hops: int = 5) -> list[dict[str, Any]]:
        """Find shortest path between two named entities."""
        if not self.is_connected:
            return []
        if max_hops < 1 or max_hops > 10:
            max_hops = 5
        a_trimmed = (entity_a or "").strip()
        b_trimmed = (entity_b or "").strip()
        if not a_trimmed or not b_trimmed or a_trimmed == b_trimmed:
            return []
        with obs_metrics.track_graph_query("shortest_path"):
            cypher = (
                "MATCH (a {name: $name_a}), (b {name: $name_b}),"
                f" path = shortestPath((a)-[*..{max_hops}]-(b))"
                " RETURN [n IN nodes(path) | n.name] AS entity_chain,"
                " [r IN relationships(path) | type(r)] AS relationship_chain,"
                " length(path) AS hops"
            )
            try:
                async with self._driver.session(database=self._database) as session:
                    result = await session.run(cypher, name_a=a_trimmed, name_b=b_trimmed)
                    return [record.data() async for record in result]
            except Exception as e:
                logger.debug("shortest_path_failed", entity_a=a_trimmed, entity_b=b_trimmed, error=str(e))
                return []

    async def detect_shell_companies(self) -> list[dict[str, Any]]:
        """Find organizations sharing a location. Only uses persisted properties (e.g. from entity attributes)."""
        if not self.is_connected:
            return []
        # Only query properties we explicitly persist (e.g. location from entity.attributes)
        # IS NOT NULL and <> '' avoid false positives from empty values
        cypher = """
        MATCH (o1:Organization)
        MATCH (o2:Organization)
        WHERE o1 <> o2
          AND o1.location IS NOT NULL
          AND o1.location = o2.location
          AND o1.location <> ''
        RETURN o1.name AS org_a, o2.name AS org_b,
               o1.location AS shared_location,
               'shared_address' AS link_type
        ORDER BY shared_location
        LIMIT 50
        """
        with obs_metrics.track_graph_query("shell_companies"):
            return await self.execute_read(cypher)

    async def degree_centrality(self, top_n: int = 10) -> list[dict[str, Any]]:
        """Most-connected nodes by relationship count."""
        if not self.is_connected:
            return []
        with obs_metrics.track_graph_query("degree_centrality"):
            cypher = (
                "MATCH (n)-[r]-()"
                " RETURN n.name AS name, n.entity_type AS type, count(r) AS degree"
                " ORDER BY degree DESC LIMIT $top_n"
            )
            async with self._driver.session(database=self._database) as session:
                result = await session.run(cypher, top_n=top_n)
                return [record.data() async for record in result]

    async def multi_path_connections(self, entity_name: str, max_hops: int = 3) -> list[dict[str, Any]]:
        """Find entities connected through 2+ independent paths."""
        if not self.is_connected:
            return []
        if max_hops < 1 or max_hops > 5:
            max_hops = 3
        cypher = (
            f"MATCH (start {{name: $name}})-[*1..{max_hops}]-(connected)"
            " WITH connected, count(*) AS path_count"
            " WHERE path_count >= 2"
            " RETURN connected.name AS name, connected.entity_type AS type,"
            " path_count ORDER BY path_count DESC LIMIT 20"
        )
        async with self._driver.session(database=self._database) as session:
            result = await session.run(cypher, name=entity_name)
            return [record.data() async for record in result]

    @staticmethod
    def _entity_type_to_label(entity_type: EntityType) -> str:
        return {
            EntityType.PERSON: "Person",
            EntityType.ORGANIZATION: "Organization",
            EntityType.LOCATION: "Location",
            EntityType.EVENT: "Event",
            EntityType.DOCUMENT: "Document",
            EntityType.FINANCIAL_INSTRUMENT: "FinancialInstrument",
        }.get(entity_type, "Entity")
