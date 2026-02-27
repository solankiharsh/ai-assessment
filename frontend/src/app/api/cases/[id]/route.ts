"use strict";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getOutputDir, readJson, readText } from "@/lib/output-dir";
import type {
  Investigation,
  SubjectProfile,
  Entity,
  Connection,
  RiskFlag,
  Hypothesis,
  SearchRecord,
  SearchPhase,
} from "@/lib/types";

const RUNNING_FILENAME = "_running.json";

/** Backend state file shape (ResearchState). */
interface StateFile {
  subject: SubjectProfile;
  entities: Entity[];
  connections: Connection[];
  risk_flags: RiskFlag[];
  search_history: SearchRecord[];
  hypotheses: Hypothesis[];
  current_phase: SearchPhase;
  iteration: number;
  max_iterations: number;
  confidence_scores: Record<string, number>;
  overall_confidence: number;
  total_llm_calls: number;
  total_search_calls: number;
  estimated_cost_usd: number;
  error_log: string[];
  final_report?: string;
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
    const reportPath = path.join(outputDir, `${id}_report.md`);
    const entitiesPath = path.join(outputDir, `${id}_entities.json`);
    const runningPath = path.join(outputDir, `${id}${RUNNING_FILENAME}`);

    const state = readJson<StateFile>(statePath);
    if (!state) {
      const running = readJson<{ subject_name?: string; started_at?: string }>(runningPath);
      if (running?.subject_name) {
        const target = running.subject_name;
        const runningInvestigation: Investigation = {
          id,
          target,
          status: "running",
          subject: {
            full_name: target,
            aliases: [],
            education: [],
            professional_history: [],
            known_associations: [],
            summary: "",
          },
          entities: [],
          connections: [],
          risk_flags: [],
          search_history: [],
          hypotheses: [],
          current_phase: "baseline",
          iteration: 0,
          max_iterations: 8,
          confidence_scores: {},
          overall_confidence: 0,
          total_llm_calls: 0,
          total_search_calls: 0,
          estimated_cost_usd: 0,
          error_log: [],
          final_report: "",
        };
        return NextResponse.json(runningInvestigation);
      }
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    try {
      fs.unlinkSync(runningPath);
    } catch {
      // ignore if running file missing
    }

    let finalReport = state.final_report ?? "";
    const reportMd = readText(reportPath);
    if (reportMd.trim()) finalReport = reportMd;

    let entities = state.entities;
    const entitiesFile = readJson<{ entities?: Entity[] }>(entitiesPath);
    if (entitiesFile?.entities?.length) entities = entitiesFile.entities;

    const investigation: Investigation = {
      id,
      target: state.subject?.full_name ?? id.replace(/_/g, " "),
      status: "complete",
      subject: state.subject,
      entities,
      connections: state.connections,
      risk_flags: state.risk_flags,
      search_history: state.search_history ?? [],
      hypotheses: state.hypotheses ?? [],
      current_phase: state.current_phase ?? "synthesis",
      iteration: state.iteration ?? 0,
      max_iterations: state.max_iterations ?? 8,
      confidence_scores: state.confidence_scores ?? {},
      overall_confidence: state.overall_confidence ?? 0,
      total_llm_calls: state.total_llm_calls ?? 0,
      total_search_calls: state.total_search_calls ?? 0,
      estimated_cost_usd: state.estimated_cost_usd ?? 0,
      error_log: state.error_log ?? [],
      final_report: finalReport,
      entities_summary: entities.map((e) => ({
        name: e.name,
        type: e.entity_type,
        confidence: e.confidence,
      })),
    };

    return NextResponse.json(investigation);
  } catch (e) {
    console.error("GET /api/cases/[id]", e);
    return NextResponse.json(
      { error: "Failed to load case" },
      { status: 500 }
    );
  }
}
