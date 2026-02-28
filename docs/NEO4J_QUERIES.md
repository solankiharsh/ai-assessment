# Neo4j Cypher Queries for Deep Research Agent

Use these in **Neo4j Browser** or **cypher-shell** against the graph persisted after an investigation. Replace `"Subject Name"` with the actual subject (e.g. `"Timothy Overturf"`, `"Jensen Huang"`).

**See also:** [NEO4J_PIPELINE_AND_TIMELINE.md](NEO4J_PIPELINE_AND_TIMELINE.md) — how Neo4j is used in the pipeline (storage + graph discovery) and why the Timeline tab can show “not available”.

---

## Quick check: does Neo4j have data?

**1. Neo4j Browser (easiest)**  
Open your Neo4j instance in a browser (e.g. Neo4j Aura: **Connect** → open the "Open with Neo4j Browser" link; or Desktop: start DB → Open). Log in with the same credentials as in `.env` (`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`). Run:

```cypher
MATCH (n) RETURN count(n) AS nodes;
MATCH ()-[r]->() RETURN count(r) AS relationships;
```

- **Nodes = 0 and relationships = 0** → graph is empty (no investigation has been persisted yet, or `ENABLE_GRAPH_DB` was false).
- **Nodes > 0** → data is stored; run the "Count by label" query below to see what’s there.

**2. cypher-shell (CLI)**  
If you have [Neo4j tools](https://neo4j.com/docs/operations-manual/current/tools/) installed:

```bash
# Bolt (default port 7687)
cypher-shell -a "bolt://localhost:7687" -u neo4j -p YOUR_PASSWORD "MATCH (n) RETURN count(n) AS nodes;"

# Neo4j Aura (use URI from .env, e.g. neo4j+s://xxxx.databases.neo4j.io)
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" "MATCH (n) RETURN count(n) AS nodes;"
```

**3. One-off Python check**  
From the repo root, with your venv active:

```bash
uv run python -c "
import asyncio
from src.config import get_settings
from neo4j import AsyncGraphDatabase

async def check():
    s = get_settings().neo4j
    driver = AsyncGraphDatabase.driver(s.uri, auth=(s.username, s.password))
    async with driver.session(database=s.database) as session:
        r = await session.run('MATCH (n) RETURN count(n) AS nodes')
        rec = await r.single()
        print('Nodes:', rec['nodes'])
    await driver.close()

asyncio.run(check())
"
```

---

## Overview & counts

```cypher
// Total nodes and relationships
MATCH (n) RETURN count(n) AS nodes;
MATCH ()-[r]->() RETURN count(r) AS relationships;

// Count by label
MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC;

// Count relationship types
MATCH ()-[r]->() RETURN type(r) AS relType, count(r) AS count ORDER BY count DESC;
```

---

## Entities

```cypher
// All people
MATCH (p:Person) RETURN p.name AS name, p.confidence AS confidence, p.entity_type AS entity_type ORDER BY p.confidence DESC;

// All organizations
MATCH (o:Organization) RETURN o.name AS name, o.confidence AS confidence ORDER BY o.confidence DESC;

// Find entity by name (fuzzy: contains)
MATCH (n) WHERE n.name CONTAINS "Overturf" RETURN n.name, labels(n), n.entity_type, n.confidence;

// High-confidence entities only
MATCH (n) WHERE n.confidence >= 0.8 RETURN n.name, labels(n), n.confidence ORDER BY n.confidence DESC;
```

---

## Connections & paths

```cypher
// All connections from/to a given person (1 hop)
MATCH (a {name: "Timothy Overturf"})-[r]-(b)
RETURN type(r) AS relationship, a.name AS from, b.name AS to, r.confidence AS confidence;

// All connections (directed, with relationship type)
MATCH (a)-[r]->(b) RETURN a.name AS from, type(r) AS rel, b.name AS to LIMIT 50;

// Shortest path between two entities (replace names)
MATCH (a {name: "Timothy Overturf"}), (b {name: "Sisu Capital"}),
      path = shortestPath((a)-[*..5]-(b))
RETURN [n IN nodes(path) | n.name] AS path, [r IN relationships(path) | type(r)] AS rels;

// Who works at / is board member of a given org
MATCH (p:Person)-[r:WORKS_AT|BOARD_MEMBER_OF|FOUNDED]->(o:Organization {name: "Sisu Capital"})
RETURN p.name, type(r), o.name;

// Organizations a person is linked to (any relationship)
MATCH (p:Person {name: "Timothy Overturf"})-[r]->(o:Organization) RETURN p.name, type(r), o.name;
MATCH (p:Person {name: "Timothy Overturf"})<-[r]-(o:Organization) RETURN o.name, type(r), p.name;
```

---

## Degree centrality (most connected nodes)

```cypher
// Top 15 most connected entities (degree = number of relationships)
MATCH (n)-[r]-()
RETURN n.name AS name, labels(n)[0] AS type, count(r) AS degree
ORDER BY degree DESC LIMIT 15;
```

---

## Risk flags

```cypher
// All risk flags with severity and category
MATCH (r:RiskFlag) RETURN r.title AS title, r.severity AS severity, r.category AS category, r.confidence AS confidence ORDER BY r.severity;

// Entities linked to risk flags (who is flagged)
MATCH (r:RiskFlag)-[:FLAGGED_FOR]->(e)
RETURN r.title AS risk, r.severity, e.name AS entity, labels(e)[0] AS entityType;

// High/critical severity only
MATCH (r:RiskFlag) WHERE r.severity IN ["high", "critical"]
RETURN r.title, r.severity, r.category, r.description;
```

---

## Shell companies / shared attributes

```cypher
// Organizations sharing an address or registered agent (potential shell pattern)
MATCH (o1:Organization), (o2:Organization)
WHERE o1.entity_id < o2.entity_id
  AND ( (o1.address IS NOT NULL AND o1.address = o2.address)
     OR (o1.registered_agent IS NOT NULL AND o1.registered_agent = o2.registered_agent) )
RETURN o1.name AS org_a, o2.name AS org_b,
       CASE WHEN o1.address = o2.address THEN "shared_address" ELSE "shared_agent" END AS link_type;
```

---

## Subgraph around subject (for viz)

```cypher
// 2-hop subgraph around subject (for Neo4j Browser graph visualization)
MATCH path = (subject {name: "Timothy Overturf"})-[*1..2]-(other)
RETURN path;
```

---

## Relationship metadata (provenance)

```cypher
// Connections with extraction timestamp and primary source URL
MATCH (a)-[r]->(b)
WHERE r.source_url_primary IS NOT NULL AND r.source_url_primary <> ""
RETURN a.name, type(r), b.name, r.confidence, r.source_url_primary, r.start_date, r.end_date
LIMIT 25;
```

---

## Cleanup (use with care)

```cypher
// Delete all nodes and relationships (same as agent’s clear_graph)
MATCH (n) DETACH DELETE n;
```
