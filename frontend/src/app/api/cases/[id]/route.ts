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
const MIN_STATE_LOGS = 50; // Prefer progress.jsonl when state.logs has fewer entries (e.g. older runs)

/** Build log lines from progress.jsonl so completed runs show execution log like adam_neumann. */
function readLogsFromProgress(outputDir: string, id: string): string[] {
  try {
    const progressPath = path.join(outputDir, `${id}_progress.jsonl`);
    const raw = fs.readFileSync(progressPath, "utf-8");
    const lines = raw.split("\n").filter((line) => line.trim());
    const logs: string[] = [];
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as Record<string, unknown>;
        const event = ev.event as string | undefined;
        if (event === "log" && typeof ev.message === "string") {
          logs.push(ev.message);
          continue;
        }
        // Format other events like structlog-style for consistency with Execution log
        const parts: string[] = [];
        if (event) parts.push(event);
        if (ev.node && ev.node !== "unknown") parts.push(`node=${ev.node}`);
        if (ev.phase != null) parts.push(`phase=${ev.phase}`);
        if (ev.iteration != null) parts.push(`iteration=${ev.iteration}`);
        if (ev.query != null) parts.push(`query=${String(ev.query).slice(0, 60)}`);
        if (ev.label != null) parts.push(`label=${ev.label}`);
        if (ev.message != null && event !== "log") parts.push(String(ev.message));
        const rest = Object.entries(ev)
          .filter(([k]) => !["event", "node", "phase", "iteration", "query", "label", "message", "ts"].includes(k))
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
        if (parts.length || rest.length) logs.push([...parts, ...rest].join(" "));
      } catch {
        // Malformed line — keep as-is
        logs.push(line.slice(0, 200));
      }
    }
    return logs;
  } catch {
    return [];
  }
}

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
  logs?: string[];
  final_report?: string;
  temporal_facts?: import("@/lib/types").TemporalFact[];
  temporal_contradictions?: import("@/lib/types").TemporalContradiction[];
  risk_debate_transcript?: { role: string; argument: string; timestamp: string }[];
  graph_insights?: { type: string; data: Record<string, unknown>[] }[];
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
    const metadataPath = path.join(outputDir, `${id}_metadata.json`);
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

    // Extract risk info from report text when structured risk_flags are empty
    const riskFlags = state.risk_flags ?? [];
    let reportRiskLevel: string | null = null;
    let riskScore = 0;
    const reportRiskFindings: { title: string; severity: string; description: string }[] = [];

    if (riskFlags.length > 0) {
      // Compute from structured flags
      const severityWeights: Record<string, number> = {
        critical: 25,
        high: 18,
        medium: 10,
        low: 4,
        info: 1,
      };
      riskScore = Math.min(
        100,
        riskFlags.reduce(
          (sum, f) => sum + (severityWeights[f.severity] ?? 5),
          0
        )
      );
      if (riskScore >= 80) reportRiskLevel = "critical";
      else if (riskScore >= 60) reportRiskLevel = "high";
      else if (riskScore >= 30) reportRiskLevel = "medium";
      else if (riskScore > 0) reportRiskLevel = "low";
      else reportRiskLevel = "clear";
    } else if (finalReport) {
      // Extract from report text
      const reportLower = finalReport.toLowerCase();

      // Detect overall risk classification
      if (
        reportLower.includes("high risk") ||
        reportLower.includes("**high risk**") ||
        reportLower.includes("classification:** high")
      ) {
        reportRiskLevel = "high";
        riskScore = 75;
      } else if (
        reportLower.includes("critical risk") ||
        reportLower.includes("**critical risk**")
      ) {
        reportRiskLevel = "critical";
        riskScore = 90;
      } else if (
        reportLower.includes("medium risk") ||
        reportLower.includes("moderate risk")
      ) {
        reportRiskLevel = "medium";
        riskScore = 45;
      } else if (
        reportLower.includes("low risk") &&
        !reportLower.includes("high risk")
      ) {
        reportRiskLevel = "low";
        riskScore = 15;
      }

      // Extract specific risk findings from markdown headers like "### 4.1 Title [HIGH RISK]"
      const riskSectionRegex =
        /###?\s+[\d.]*\s*(.+?)\s*\[(\w+)\s+RISK\]/gi;
      let match;
      while ((match = riskSectionRegex.exec(finalReport)) !== null) {
        const title = match[1].trim();
        const severity = match[2].toLowerCase();
        // Get the text after this header until the next header
        const startIdx = match.index + match[0].length;
        const nextHeader = finalReport.indexOf("\n#", startIdx);
        const sectionText =
          nextHeader > 0
            ? finalReport.slice(startIdx, nextHeader)
            : finalReport.slice(startIdx, startIdx + 500);
        // Take first meaningful line as description
        const lines = sectionText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 10 && !l.startsWith("#") && !l.startsWith("|"));
        const description = lines[0] ?? title;

        const validSeverities = ["critical", "high", "medium", "low", "info"];
        reportRiskFindings.push({
          title,
          severity: validSeverities.includes(severity) ? severity : "medium",
          description: description.replace(/^\*+|\*+$/g, "").trim(),
        });
      }

      // If we found findings but no overall classification, derive it
      if (reportRiskFindings.length > 0 && !reportRiskLevel) {
        const hasCritical = reportRiskFindings.some(
          (f) => f.severity === "critical"
        );
        const hasHigh = reportRiskFindings.some((f) => f.severity === "high");
        if (hasCritical) {
          reportRiskLevel = "critical";
          riskScore = 90;
        } else if (hasHigh) {
          reportRiskLevel = "high";
          riskScore = 70;
        } else {
          reportRiskLevel = "medium";
          riskScore = 45;
        }
      }
    }

    // Fallback: when source verification never ran (e.g. low max-iter), derive from entity confidences
    const rawConf = state.overall_confidence ?? 0;
    const entityConfs = entities.filter((e) => e.confidence > 0).map((e) => e.confidence);
    const computedConfidence =
      entityConfs.length > 0
        ? entityConfs.reduce((a, b) => a + b, 0) / entityConfs.length
        : 0;
    const overallConfidence = rawConf > 0 ? rawConf : computedConfidence;

    const investigation: Investigation = {
      id,
      target: state.subject?.full_name ?? id.replace(/_/g, " "),
      status: "complete",
      subject: state.subject,
      entities,
      connections: state.connections,
      risk_flags: riskFlags,
      search_history: state.search_history ?? [],
      hypotheses: state.hypotheses ?? [],
      current_phase: state.current_phase ?? "synthesis",
      iteration: state.iteration ?? 0,
      max_iterations: state.max_iterations ?? 8,
      confidence_scores: state.confidence_scores ?? {},
      overall_confidence: overallConfidence,
      total_llm_calls: state.total_llm_calls ?? 0,
      total_search_calls: state.total_search_calls ?? 0,
      estimated_cost_usd: state.estimated_cost_usd ?? 0,
      error_log: state.error_log ?? [],
      logs: (() => {
        const stateLogs = state.logs ?? [];
        if (stateLogs.length >= MIN_STATE_LOGS) return stateLogs;
        const progressLogs = readLogsFromProgress(outputDir, id);
        return progressLogs.length > 0 ? progressLogs : stateLogs;
      })(),
      final_report: finalReport,
      entities_summary: entities.map((e) => ({
        name: e.name,
        type: e.entity_type,
        confidence: e.confidence,
      })),
      report_risk_level: reportRiskLevel as Investigation["report_risk_level"],
      risk_score: riskScore,
      report_risk_findings: reportRiskFindings as Investigation["report_risk_findings"],
      temporal_facts: state.temporal_facts ?? [],
      temporal_contradictions: state.temporal_contradictions ?? [],
      risk_debate_transcript: state.risk_debate_transcript ?? [],
      graph_insights: state.graph_insights ?? [],
      run_metadata: readJson<Investigation["run_metadata"]>(metadataPath) ?? undefined,
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
