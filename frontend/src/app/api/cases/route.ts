"use strict";

import { NextResponse } from "next/server";
import { getOutputDir, listStateFiles, readJson, readText, getMtime } from "@/lib/output-dir";
import { computeRiskScore, computeOverallConfidence, applyReportFindings } from "@/lib/case-metrics";
import type { CaseSummary } from "@/lib/types";

/** Raw state shape from backend (subset we need for list). */
interface StateSummary {
  subject?: { full_name?: string };
  entities?: { confidence?: number }[];
  risk_flags?: { severity?: string }[];
  overall_confidence?: number;
  final_report?: string;
}

interface RunningSummary {
  subject_name?: string;
  started_at?: string;
}

export async function GET() {
  try {
    const outputDir = getOutputDir();
    const ids = listStateFiles(outputDir);
    const cases: CaseSummary[] = [];

    for (const id of ids) {
      const statePath = `${outputDir}/${id}_state.json`;
      const reportPath = `${outputDir}/${id}_report.md`;
      const runningPath = `${outputDir}/${id}_running.json`;
      const state = readJson<StateSummary>(statePath);
      const running = readJson<RunningSummary>(runningPath);
      const mtime = getMtime(statePath) ?? getMtime(runningPath);

      if (state) {
        const reportText = readText(reportPath);
        const base = computeRiskScore(state, reportText);
        const { riskScore } = applyReportFindings(reportText, base.riskScore, base.reportRiskLevel);
        // Resolve entities same as detail API: state.entities then overwrite with file if present
        let entities = state.entities ?? [];
        const entitiesPath = `${outputDir}/${id}_entities.json`;
        const entitiesFile = readJson<{ entities?: { confidence?: number }[] }>(entitiesPath);
        if (entitiesFile?.entities?.length) entities = entitiesFile.entities;
        const confidence = computeOverallConfidence(state.overall_confidence, entities);
        cases.push({
          id,
          subject_name: state.subject?.full_name ?? id.replace(/_/g, " "),
          updated_at: mtime ? mtime.toISOString() : new Date().toISOString(),
          risk_score: riskScore > 0 ? riskScore : undefined,
          confidence: confidence > 0 ? confidence : undefined,
          status: "complete",
        });
      } else if (running) {
        cases.push({
          id,
          subject_name: running.subject_name ?? id.replace(/_/g, " "),
          updated_at: mtime ? mtime.toISOString() : new Date().toISOString(),
          risk_score: undefined,
          confidence: undefined,
          status: "running",
        });
      }
    }

    cases.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return NextResponse.json({ cases });
  } catch (e) {
    console.error("GET /api/cases", e);
    return NextResponse.json(
      { error: "Failed to list cases" },
      { status: 500 }
    );
  }
}
