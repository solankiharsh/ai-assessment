"use strict";

import { NextResponse } from "next/server";
import { getOutputDir, listStateFiles, readJson, readText, getMtime } from "@/lib/output-dir";
import type { CaseSummary } from "@/lib/types";

/** Raw state shape from backend (subset we need for list). */
interface StateSummary {
  subject?: { full_name?: string };
  risk_flags?: { severity?: string }[];
  overall_confidence?: number;
  final_report?: string;
}

interface RunningSummary {
  subject_name?: string;
  started_at?: string;
}

/** Severity weights — must match detail API (api/cases/[id]/route.ts). */
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 25,
  high: 18,
  medium: 10,
  low: 4,
  info: 1,
};

/** Extract a numeric risk score from risk_flags or report text. */
function computeRiskScore(state: StateSummary, reportText: string): number | undefined {
  // From structured flags: use same severity-weighted sum as detail API
  if (state.risk_flags && Array.isArray(state.risk_flags) && state.risk_flags.length > 0) {
    const sum = state.risk_flags.reduce(
      (acc, f) => acc + (SEVERITY_WEIGHTS[f.severity ?? ""] ?? 5),
      0
    );
    return Math.min(100, sum);
  }
  // From report text
  const text = reportText || state.final_report || "";
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (lower.includes("critical risk") || lower.includes("**critical risk**")) return 90;
  if (lower.includes("high risk") || lower.includes("**high risk**") || lower.includes("classification:** high")) return 75;
  if (lower.includes("medium risk") || lower.includes("moderate risk")) return 45;
  if (lower.includes("low risk") && !lower.includes("high risk")) return 15;
  return undefined;
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
        const riskScore = computeRiskScore(state, reportText);
        let confidence = state.overall_confidence;
        if (confidence === 0 || confidence === undefined) {
          const entitiesPath = `${outputDir}/${id}_entities.json`;
          const entitiesFile = readJson<{ entities?: { confidence?: number }[] }>(entitiesPath);
          const entityList = entitiesFile?.entities ?? [];
          const entityConfs = entityList
            .filter((e) => e?.confidence != null && e.confidence > 0)
            .map((e) => e.confidence!);
          if (entityConfs.length > 0) {
            confidence =
              entityConfs.reduce((a, b) => a + b, 0) / entityConfs.length;
          }
        }
        cases.push({
          id,
          subject_name: state.subject?.full_name ?? id.replace(/_/g, " "),
          updated_at: mtime ? mtime.toISOString() : new Date().toISOString(),
          risk_score: riskScore,
          confidence: confidence ?? state.overall_confidence,
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
