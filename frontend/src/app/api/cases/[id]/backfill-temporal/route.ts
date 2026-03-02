"use strict";

import { NextResponse } from "next/server";
import path from "path";
import { getOutputDir, getOutputsCapturedDir, readJson } from "@/lib/output-dir";
import {
  getCaseFromSupabase,
  uploadCaseToSupabase,
  isSupabaseConfigured,
  type CaseMeta,
} from "@/lib/supabase-cases";

/**
 * POST /api/cases/[id]/backfill-temporal
 *
 * If the case in Supabase has no temporal_facts/temporal_contradictions,
 * merges them from a local state file (outputs_captured/{id}_state.json or
 * outputs/{id}_state.json) and re-uploads to Supabase.
 *
 * Use when the Timeline tab is empty because the run wrote 0 temporal facts
 * but you have a state file elsewhere with temporal data.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes("..") || /[^a-z0-9_]/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const result = await getCaseFromSupabase(id);
  if (!result) {
    return NextResponse.json(
      { error: "Case not found in Supabase", hint: "Ensure the case exists in the bucket first" },
      { status: 404 }
    );
  }
  const { files: stored, ownerId: caseOwnerId } = result;

  const state = stored.state as Record<string, unknown>;
  const existingFacts = (state.temporal_facts as unknown[]) ?? [];
  const existingContradictions = (state.temporal_contradictions as unknown[]) ?? [];
  if (existingFacts.length > 0 || existingContradictions.length > 0) {
    return NextResponse.json({
      ok: true,
      message: "Temporal data already present",
      temporal_facts: existingFacts.length,
      temporal_contradictions: existingContradictions.length,
    });
  }

  const capturedDir = getOutputsCapturedDir();
  const outputDir = getOutputDir();
  const candidates = [
    path.join(capturedDir, `${id}_state.json`),
    path.join(outputDir, `${id}_state.json`),
  ];

  let sourceState: Record<string, unknown> | null = null;
  let usedPath: string | null = null;
  for (const p of candidates) {
    const loaded = readJson<Record<string, unknown>>(p);
    const facts = loaded?.temporal_facts;
    const contradictions = loaded?.temporal_contradictions;
    const hasFacts = Array.isArray(facts) && facts.length > 0;
    const hasContradictions = Array.isArray(contradictions) && contradictions.length > 0;
    if (hasFacts || hasContradictions) {
      sourceState = loaded;
      usedPath = p;
      break;
    }
  }

  if (!sourceState) {
    return NextResponse.json(
      {
        error: "No local state file with temporal data found",
        hint: `Put a state JSON with temporal_facts/temporal_contradictions at outputs_captured/${id}_state.json or outputs/${id}_state.json, or run: python scripts/merge_temporal_into_state.py --state path/to/${id}_state.json`,
        tried: candidates,
      },
      { status: 404 }
    );
  }

  const facts = (sourceState.temporal_facts as unknown[]) ?? [];
  const contradictions = (sourceState.temporal_contradictions as unknown[]) ?? [];
  const mergedState = {
    ...state,
    temporal_facts: facts,
    temporal_contradictions: contradictions,
  };

  const meta: CaseMeta = {
    subject_name: (state.subject as { full_name?: string })?.full_name ?? id.replace(/_/g, " "),
    risk_score: typeof state.risk_score === "number" ? state.risk_score : 0,
    confidence: typeof state.overall_confidence === "number" ? state.overall_confidence : 0,
    updated_at: new Date().toISOString(),
  };

  await uploadCaseToSupabase(id, {
    state: mergedState,
    report: stored.report,
    entities: stored.entities,
    metadata: stored.metadata,
    progress: stored.progress,
  }, meta, caseOwnerId);

  return NextResponse.json({
    ok: true,
    message: "Temporal data backfilled and re-uploaded to Supabase",
    source: usedPath ?? "local",
    temporal_facts: facts.length,
    temporal_contradictions: contradictions.length,
  });
}
