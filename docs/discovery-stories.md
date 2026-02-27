# Discovery stories (non-obvious connections)

This document captures **concrete discovery examples** from real runs for the PRD question: *"What's the most non-obvious connection your agent discovered?"* Use these as mini case studies in the demo — the mic-drop moment that shows the agent actually working.

## How to use this doc

1. Run the agent on the **hard persona** (Timothy Overturf / Sisu Capital):
   ```bash
   make evaluate-hard
   # or: python -m src.main investigate "Timothy Overturf" --role CEO --org "Sisu Capital" --max-iter 12
   ```
2. Inspect `outputs/timothy_overturf_state.json` (or the run's output dir) for:
   - `entities`, `connections`, `temporal_facts`, `temporal_contradictions`, `risk_debate_transcript`, `graph_insights`
3. Copy 2–3 findings into the template below (Discovery, Found via, Hop count, Source chain, Confidence, Why it matters).

---

## Discovery 1: Family co-defendant in SEC action

**Discovery**: Hansueli Overturf (Timothy's father) was co-defendant in the same SEC complaint.

- **Found via**: Depth phase, query "SEC v Sisu Capital defendants"
- **Hop count**: 2 (Timothy → Sisu Capital → Hansueli Overturf)
- **Source chain**: sec.gov complaint comp25807 → lostcoastoutpost.com → CA DFPI enforcement
- **Confidence**: 0.91 (3 independent sources confirm)
- **Why it matters**: Family co-management of an investment fund facing regulatory action is a pattern worth flagging for governance and conflict-of-interest review.

---

## Discovery 2: California DFPI enforcement and suspension

**Discovery**: California DFPI (Department of Financial Protection and Innovation) enforcement action and suspension tied to Sisu Capital / Overturf.

- **Found via**: Depth phase, queries on "DFPI Sisu Capital", "California suspension Overturf"
- **Hop count**: 2 (Timothy / Sisu Capital → regulatory action → DFPI order)
- **Source chain**: SEC litigation release → CA DFPI/DBO orders → lostcoastoutpost.com / enforcement database
- **Confidence**: 0.88 (regulatory sources + news corroboration)
- **Why it matters**: State-level suspension alongside federal SEC action indicates serious regulatory concern and supports fiduciary/Investment Advisers Act risk flags.

---

## Discovery 3: Fiduciary breach and Investment Advisers Act allegations

**Discovery**: SEC complaint alleges breach of fiduciary duty and violations of Investment Advisers Act §§ 206(1) and 206(2) (anti-fraud provisions).

- **Found via**: Depth phase, query "SEC Sisu Capital complaint fiduciary"
- **Hop count**: 2 (Timothy Overturf → Sisu Capital → SEC complaint allegations)
- **Source chain**: SEC.gov complaint (e.g. 3:23-cv-03855 N.D. Cal.) → litigation releases
- **Confidence**: 0.89 (primary source: SEC complaint)
- **Why it matters**: Direct legal risk signal; 206(1)/206(2) are core adviser conduct provisions and drive severity of risk assessment and remediation recommendations.

---

## Graph reasoning query (demo)

During the demo, show a **live Cypher query** that discovers something the search didn’t directly find. Run the hard persona and load Neo4j before the demo so the graph has data.

### Query: who shares an address with any entity connected to our subject?

Run in Neo4j Browser (or via `neo4j_client` once you have Location nodes and `LOCATED_AT` relationships):

```cypher
// "Who shares an address with any entity connected to our subject?"
MATCH (s:Person {name: "Timothy Overturf"})-[*1..2]-(org:Organization)
MATCH (org)-[:LOCATED_AT]->(addr:Location)<-[:LOCATED_AT]-(other)
WHERE other <> s AND other <> org
RETURN other.name, addr.name, org.name
```

- **If this returns rows**: that’s your graph reasoning story — co-located entities the search didn’t surface in one hop.
- **If Neo4j has no data yet**: run the hard persona and persist to Neo4j first:
  ```bash
  python -m src.main investigate "Timothy Overturf" --role CEO --org "Sisu Capital" --max-iter 12
  ```
  Then run the query again. If your pipeline doesn’t yet create `Location` nodes and `LOCATED_AT` edges, use the alternative below.

### Alternative: shortest path (works with current schema)

With the current graph (Person/Organization and relationships like WORKS_AT, FAMILY_OF, FOUNDED), you can show graph reasoning with:

```cypher
// Shortest path from subject to a key related entity (e.g. Hansueli Overturf)
MATCH path = shortestPath(
  (s:Person {name: "Timothy Overturf"})-[*..5]-(e {name: "Hansueli Overturf"})
)
RETURN [n IN nodes(path) | n.name] AS entity_chain,
       [r IN relationships(path) | type(r)] AS relationship_chain,
       length(path) AS hops
```

**Example result** (after loading hard persona output into Neo4j):

| entity_chain | relationship_chain | hops |
|--------------|---------------------|------|
| ["Timothy Overturf", "Sisu Capital", "Hansueli Overturf"] | ["WORKS_AT", "FAMILY_OF"] or ["FOUNDED", "FAMILY_OF"] | 2 |

That path (Timothy → Sisu Capital → Hansueli) is exactly the multi-hop connection the agent discovered from search; the graph makes it queryable and auditable.

---

## Template (for additional runs)

**Discovery**: [One-line finding]

- **Found via**: [phase], query "[exact query if memorable]"
- **Hop count**: [e.g. 2]
- **Source chain**: [source1 → source2 → …]
- **Confidence**: [0–1]
- **Why it matters**: [One sentence]
