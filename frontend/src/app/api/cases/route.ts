"use strict";

import { NextResponse } from "next/server";
import { getOutputDir, listStateFiles, readJson, getMtime } from "@/lib/output-dir";
import type { CaseSummary } from "@/lib/types";

/** Raw state shape from backend (subset we need for list). */
interface StateSummary {
  subject?: { full_name?: string };
  risk_flags?: unknown[];
  overall_confidence?: number;
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
      const runningPath = `${outputDir}/${id}_running.json`;
      const state = readJson<StateSummary>(statePath);
      const running = readJson<RunningSummary>(runningPath);
      const mtime = getMtime(statePath) ?? getMtime(runningPath);

      if (state) {
        const riskScore =
          state.risk_flags && Array.isArray(state.risk_flags)
            ? Math.min(100, state.risk_flags.length * 15)
            : undefined;
        cases.push({
          id,
          subject_name: state.subject?.full_name ?? id.replace(/_/g, " "),
          updated_at: mtime ? mtime.toISOString() : new Date().toISOString(),
          risk_score: riskScore,
          confidence: state.overall_confidence,
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
