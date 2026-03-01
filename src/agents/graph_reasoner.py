"""
Graph Reasoning Node — runs discovery queries against Neo4j
to find patterns that no individual search result contains.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from src.models import GraphInsight

if TYPE_CHECKING:
    from src.graph_db.neo4j_client import Neo4jClient

logger = structlog.get_logger(__name__)

# Pre-built discovery queries — run automatically after graph population.
# Schema: Person/Organization/etc. use entity_id and name; RiskFlag uses flag_id, severity (lowercase).
DISCOVERY_QUERIES: dict[str, dict[str, Any]] = {
    "hidden_intermediaries": {
        "description": "Entities connected to subject through 2+ independent paths",
        "cypher": """
            MATCH (s:Person)
            WHERE s.name = $subject_name
            MATCH (s)-[r1*1..2]-(intermediate)-[r2*1..2]-(s)
            WHERE intermediate <> s
            WITH intermediate, count(DISTINCT r1) AS path_count
            WHERE path_count >= 2
            RETURN intermediate.name AS entity,
                   labels(intermediate)[0] AS type,
                   path_count AS connection_strength
            ORDER BY connection_strength DESC
            LIMIT 10
        """,
        "insight_type": "hidden_connection",
    },
    "shared_addresses": {
        "description": "Organizations sharing a location (shell company indicator). Uses only persisted location property.",
        "cypher": """
            MATCH (o1:Organization)
            MATCH (o2:Organization)
            WHERE o1 <> o2
              AND o1.location IS NOT NULL
              AND o1.location = o2.location
              AND o1.location <> ''
            RETURN o1.name AS org1, o2.name AS org2, o1.location AS shared_location
            LIMIT 20
        """,
        "insight_type": "shell_company_indicator",
    },
    "risk_proximity": {
        "description": "Shortest path from subject to any HIGH-severity risk flag",
        "cypher": """
            MATCH (s:Person)
            WHERE s.name = $subject_name
            MATCH (rf:RiskFlag)
            WHERE rf.severity IN ['high', 'critical']
            MATCH p = shortestPath((s)-[*..4]-(rf))
            RETURN rf.title AS risk,
                   rf.severity AS severity,
                   length(p) AS hops,
                   [n IN nodes(p) | coalesce(n.name, n.title, '')] AS path_names
            ORDER BY length(p)
            LIMIT 10
        """,
        "insight_type": "risk_proximity",
    },
    "hub_entities": {
        "description": "Most connected entities (potential key facilitators)",
        "cypher": """
            MATCH (n)-[r]-()
            WHERE NOT n:RiskFlag
            WITH n, count(r) AS degree, labels(n)[0] AS type
            WHERE degree >= 3
            RETURN n.name AS entity, type, degree
            ORDER BY degree DESC
            LIMIT 10
        """,
        "insight_type": "hub_entity",
    },
    "temporal_overlap": {
        "description": "Organizations with overlapping active periods and shared personnel",
        "cypher": """
            MATCH (p:Person)-[r1]->(o1:Organization)
            MATCH (p)-[r2]->(o2:Organization)
            WHERE o1 <> o2
              AND r1.start_date IS NOT NULL
              AND r2.start_date IS NOT NULL
            RETURN p.name AS person,
                   o1.name AS org1, r1.start_date AS org1_start, r1.end_date AS org1_end,
                   o2.name AS org2, r2.start_date AS org2_start, r2.end_date AS org2_end
            LIMIT 20
        """,
        "insight_type": "temporal_overlap",
    },
    "isolated_clusters": {
        "description": "Entity clusters disconnected from the main subject graph",
        "cypher": """
            MATCH (s:Person)
            WHERE s.name = $subject_name
            MATCH (n)
            WHERE NOT n:RiskFlag
              AND NOT exists((s)-[*1..4]-(n))
              AND n <> s
            RETURN n.name AS entity, labels(n)[0] AS type
            LIMIT 10
        """,
        "insight_type": "isolated_entity",
    },
}


async def graph_reasoning_node(
    state: dict[str, Any],
    neo4j_client: Neo4jClient,
) -> dict[str, Any]:
    """
    Run discovery queries against the populated Neo4j graph.
    Results are stored in state['graph_insights'] for the report.
    """
    from src.config import get_settings

    settings = get_settings()
    if not settings.agent.enable_graph_db:
        logger.info("graph_reasoning_skipped", reason="graph_db_disabled")
        return {**state, "graph_reasoning_complete": True}

    if not state.get("graph_db_populated"):
        logger.info("graph_reasoning_skipped", reason="graph_not_populated")
        return {**state, "graph_reasoning_complete": True}

    subject = state.get("subject") or {}
    subject_name = subject.get("full_name", "") if isinstance(subject, dict) else getattr(subject, "full_name", "")
    if not subject_name:
        logger.warning("graph_reasoning_skipped", reason="no_subject_name")
        return {**state, "graph_reasoning_complete": True}

    if not neo4j_client.is_connected:
        await neo4j_client.connect()
    if not neo4j_client.is_connected:
        logger.warning("graph_reasoning_skipped", reason="neo4j_not_connected")
        return {**state, "graph_reasoning_complete": True}

    insights: list[dict[str, Any]] = list(state.get("graph_insights") or [])
    params = {"subject_name": subject_name}

    for query_name, query_def in DISCOVERY_QUERIES.items():
        try:
            results = await neo4j_client.execute_read(
                query_def["cypher"].strip(),
                parameters=params,
            )
            if results:
                insight = GraphInsight(
                    query_name=query_name,
                    description=query_def["description"],
                    insight_type=query_def["insight_type"],
                    results=[dict(r) for r in results],
                    result_count=len(results),
                )
                insights.append(insight.model_dump())
                logger.info(
                    "graph_insight_found",
                    query=query_name,
                    result_count=len(results),
                )
            else:
                logger.debug("graph_insight_empty", query=query_name)
        except Exception as e:
            logger.warning(
                "graph_reasoning_query_failed",
                query=query_name,
                error=str(e),
            )

    total_insights = sum(i.get("result_count", 0) for i in insights)
    logger.info(
        "graph_reasoning_complete",
        queries_run=len(DISCOVERY_QUERIES),
        insights_found=len(insights),
        total_results=total_insights,
    )
    return {
        **state,
        "graph_insights": insights,
        "graph_reasoning_complete": True,
    }
