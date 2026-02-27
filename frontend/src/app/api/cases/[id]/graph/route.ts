"use strict";

import { NextResponse } from "next/server";
import path from "path";
import { getOutputDir, readJson } from "@/lib/output-dir";
import type { GraphResponse } from "@/lib/types";
import type { Entity, Connection } from "@/lib/types";

interface StateFile {
  entities: Entity[];
  connections: Connection[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes("..") || /[^a-z0-9_]/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  try {
    const outputDir = getOutputDir();
    const statePath = path.join(outputDir, `${id}_state.json`);
    const state = readJson<StateFile>(statePath);
    if (!state) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

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
