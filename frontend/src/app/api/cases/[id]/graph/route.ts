"use strict";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getOutputDir, readJson } from "@/lib/output-dir";
import type { GraphResponse } from "@/lib/types";
import type { Entity, Connection } from "@/lib/types";

interface StateFile {
  subject?: { full_name?: string };
  entities: Entity[];
  connections: Connection[];
}

/** Allowlisted Cypher queries for live Neo4j execution. Only these keys may be used. */
const ALLOWED_QUERIES: Record<
  string,
  { cypher: string; params?: (state: StateFile) => Record<string, unknown> }
> = {
  full_graph: {
    cypher: `
      MATCH (n)-[r]-(m)
      WHERE n.investigation_id = $investigation_id OR m.investigation_id = $investigation_id
      RETURN n, r, m
      LIMIT 200
    `,
    params: (state) => ({
      investigation_id: (state.subject?.full_name ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 64) || "run",
    }),
  },
  risk_paths: {
    cypher: `
      MATCH (s:Person)
      WHERE s.name = $subject_name
      MATCH (rf:RiskFlag)
      WHERE rf.severity IN ['high', 'critical']
      MATCH p = shortestPath((s)-[*..4]-(rf))
      RETURN p
      LIMIT 20
    `,
    params: (state) => ({ subject_name: state.subject?.full_name ?? "" }),
  },
  hub_entities: {
    cypher: `
      MATCH (n)-[r]-()
      WHERE n.investigation_id = $investigation_id AND NOT n:RiskFlag
      WITH n, count(r) AS degree, labels(n)[0] AS type
      WHERE degree >= 3
      RETURN n.name AS entity, type, degree
      ORDER BY degree DESC
      LIMIT 10
    `,
    params: (state) => ({
      investigation_id: (state.subject?.full_name ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 64) || "run",
    }),
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes("..") || /[^a-z0-9_]/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  const queryName = request.nextUrl.searchParams.get("query") ?? undefined;

  try {
    const outputDir = getOutputDir();
    const statePath = path.join(outputDir, `${id}_state.json`);
    const state = readJson<StateFile>(statePath);
    if (!state) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Optional: run allowlisted Cypher against Neo4j when query param is set and Neo4j is configured
    if (queryName) {
      if (!(queryName in ALLOWED_QUERIES)) {
        return NextResponse.json(
          { error: "Invalid query. Allowed: full_graph, risk_paths, hub_entities" },
          { status: 400 }
        );
      }
      const uri = process.env.NEO4J_URI;
      const user = process.env.NEO4J_USERNAME;
      const password = process.env.NEO4J_PASSWORD;
      if (!uri || !user || !password) {
        return NextResponse.json(
          {
            error: "Neo4j not configured for live queries. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD.",
          },
          { status: 503 }
        );
      }
      try {
        const driver = (await import("neo4j-driver")).default;
        const neo4jDriver = driver.driver(uri, driver.auth.basic(user, password));
        const session = neo4jDriver.session();
        const def = ALLOWED_QUERIES[queryName];
        const params = def.params?.(state) ?? {};
        const result = await session.run(def.cypher.trim(), params);
        const results = result.records.map((rec: { toObject: () => unknown }) =>
          rec.toObject()
        );
        await session.close();
        await neo4jDriver.close();
        return NextResponse.json({ query: queryName, results });
      } catch (neo4jError) {
        console.error("Neo4j live query error", queryName, neo4jError);
        return NextResponse.json(
          { error: "Neo4j query failed", details: String(neo4jError) },
          { status: 502 }
        );
      }
    }

    // Default: return graph from state JSON (no Neo4j required)
    const entityIds = new Set(state.entities.map((e) => e.id));
    const nodes = state.entities.map((e) => ({
      id: e.id,
      label: e.name,
      type: e.entity_type,
      data: { confidence: e.confidence },
    }));

    const edges = state.connections
      .filter(
        (c) =>
          entityIds.has(c.source_entity_id) && entityIds.has(c.target_entity_id)
      )
      .map((c) => ({
        id: c.id,
        source: c.source_entity_id,
        target: c.target_entity_id,
        label: c.relationship_type,
        confidence: c.confidence,
      }));

    const response: GraphResponse = { nodes, edges };
    return NextResponse.json(response);
  } catch (e) {
    console.error("GET /api/cases/[id]/graph", e);
    return NextResponse.json(
      { error: "Failed to load graph" },
      { status: 500 }
    );
  }
}
