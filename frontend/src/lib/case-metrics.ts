"use strict";

/**
 * Shared case metrics (risk score, overall confidence) so list and detail APIs
 * always return the same values for the same case. Used by GET /api/cases and GET /api/cases/[id].
 */

export const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 25,
  high: 18,
  medium: 10,
  low: 4,
  info: 1,
};

export interface RiskScoreInput {
  risk_flags?: { severity?: string }[];
  final_report?: string;
}

/**
 * Compute numeric risk score (0–100) from risk_flags or report text.
 * Same logic for list and detail API.
 */
export function computeRiskScore(
  state: RiskScoreInput,
  reportText: string
): { riskScore: number; reportRiskLevel: string | null } {
  const riskFlags = state.risk_flags ?? [];
  let riskScore = 0;
  let reportRiskLevel: string | null = null;

  if (riskFlags.length > 0) {
    const sum = riskFlags.reduce(
      (acc, f) => acc + (SEVERITY_WEIGHTS[f.severity ?? ""] ?? 5),
      0
    );
    riskScore = Math.min(100, sum);
    if (riskScore >= 80) reportRiskLevel = "critical";
    else if (riskScore >= 60) reportRiskLevel = "high";
    else if (riskScore >= 30) reportRiskLevel = "medium";
    else if (riskScore > 0) reportRiskLevel = "low";
    else reportRiskLevel = "clear";
  } else {
    const text = reportText || state.final_report || "";
    const lower = text.toLowerCase();
    if (lower.includes("critical risk") || lower.includes("**critical risk**")) {
      reportRiskLevel = "critical";
      riskScore = 90;
    } else if (
      lower.includes("high risk") ||
      lower.includes("**high risk**") ||
      lower.includes("classification:** high")
    ) {
      reportRiskLevel = "high";
      riskScore = 75;
    } else if (
      lower.includes("medium risk") ||
      lower.includes("moderate risk")
    ) {
      reportRiskLevel = "medium";
      riskScore = 45;
    } else if (
      lower.includes("low risk") &&
      !lower.includes("high risk")
    ) {
      reportRiskLevel = "low";
      riskScore = 15;
    }
  }

  return { riskScore, reportRiskLevel };
}

export interface ReportRiskFinding {
  title: string;
  severity: string;
  description: string;
}

/**
 * Parse report for ### Title [SEVERITY RISK] sections and, if no level yet, derive risk score/level from findings.
 * Shared so list and detail APIs get the same risk score.
 */
export function applyReportFindings(
  reportText: string,
  riskScore: number,
  reportRiskLevel: string | null
): { riskScore: number; reportRiskLevel: string | null; reportRiskFindings: ReportRiskFinding[] } {
  const findings: ReportRiskFinding[] = [];
  const riskSectionRegex = /###?\s+[\d.]*\s*(.+?)\s*\[(\w+)\s+RISK\]/gi;
  let match;
  while ((match = riskSectionRegex.exec(reportText)) !== null) {
    const title = match[1].trim();
    const severity = match[2].toLowerCase();
    const startIdx = match.index + match[0].length;
    const nextHeader = reportText.indexOf("\n#", startIdx);
    const sectionText =
      nextHeader > 0
        ? reportText.slice(startIdx, nextHeader)
        : reportText.slice(startIdx, startIdx + 500);
    const lines = sectionText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10 && !l.startsWith("#") && !l.startsWith("|"));
    const description = lines[0] ?? title;
    const validSeverities = ["critical", "high", "medium", "low", "info"];
    findings.push({
      title,
      severity: validSeverities.includes(severity) ? severity : "medium",
      description: description.replace(/^\*+|\*+$/g, "").trim(),
    });
  }
  let finalScore = riskScore;
  let finalLevel = reportRiskLevel;
  if (findings.length > 0 && !reportRiskLevel) {
    const hasCritical = findings.some((f) => f.severity === "critical");
    const hasHigh = findings.some((f) => f.severity === "high");
    if (hasCritical) {
      finalLevel = "critical";
      finalScore = 90;
    } else if (hasHigh) {
      finalLevel = "high";
      finalScore = 70;
    } else {
      finalLevel = "medium";
      finalScore = 45;
    }
  }
  return { riskScore: finalScore, reportRiskLevel: finalLevel, reportRiskFindings: findings };
}

export interface EntityWithConfidence {
  confidence?: number;
}

/**
 * Compute overall confidence (0–1) from state.overall_confidence or entity confidences.
 * Same logic for list and detail API.
 */
export function computeOverallConfidence(
  stateOverallConfidence: number | undefined | null,
  entities: EntityWithConfidence[]
): number {
  const raw = stateOverallConfidence ?? 0;
  if (raw > 0) return raw;
  const confs = entities
    .filter((e) => e?.confidence != null && e.confidence > 0)
    .map((e) => e.confidence!);
  if (confs.length === 0) return 0;
  return confs.reduce((a, b) => a + b, 0) / confs.length;
}
