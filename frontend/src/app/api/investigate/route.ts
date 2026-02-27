"use strict";

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { subjectToSlug } from "@/lib/utils";
import type { InvestigateRequest, InvestigateResponse } from "@/lib/types";

const RUNNING_FILENAME = "_running.json";

/** Allowlisted: letters, numbers, spaces, common punctuation. No shell metacharacters. */
function sanitizeArg(s: string, maxLen: number): string {
  const trimmed = s.trim().slice(0, maxLen);
  return trimmed.replace(/[^\p{L}\p{N}\s\-_.',()&]/gu, "");
}

/** Output dir for backend: same as GET /api/cases reads. Use OUTPUT_DIR env to override. */
function getOutputDir(): string {
  const env = process.env.OUTPUT_DIR;
  if (env) return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  return path.resolve(process.cwd(), "..", "outputs");
}

/**
 * Repo root and Python. Prefer REPO_ROOT and BACKEND_PYTHON from env (e.g. .env.local).
 * If unset, infer when cwd is frontend/: repo root = parent of cwd, python = repo/.venv/bin/python.
 */
function getRepoRootAndPython(): { repoRoot: string; pythonPath: string } {
  const cwd = process.cwd();
  const inferredRepoRoot =
    path.basename(cwd) === "frontend"
      ? path.resolve(cwd, "..")
      : path.resolve(cwd);
  const repoRoot = process.env.REPO_ROOT
    ? (path.isAbsolute(process.env.REPO_ROOT)
        ? process.env.REPO_ROOT
        : path.resolve(cwd, process.env.REPO_ROOT))
    : inferredRepoRoot;
  const pythonPath = process.env.BACKEND_PYTHON
    ? (path.isAbsolute(process.env.BACKEND_PYTHON)
        ? process.env.BACKEND_PYTHON
        : path.resolve(cwd, process.env.BACKEND_PYTHON))
    : path.join(
        repoRoot,
        ".venv",
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "python.exe" : "python"
      );
  return { repoRoot, pythonPath };
}

/**
 * Start an investigation by spawning the backend CLI. Returns case_id immediately;
 * the pipeline runs in the background. Frontend can poll GET /api/cases/:id until data appears.
 */
export async function POST(request: Request) {
  let body: InvestigateRequest;
  try {
    body = (await request.json()) as InvestigateRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const rawName =
    typeof body.subject_name === "string" ? body.subject_name.trim() : "";
  if (!rawName || rawName.length > 500) {
    return NextResponse.json(
      { error: "subject_name is required (max 500 chars)" },
      { status: 400 }
    );
  }

  const subject_name = sanitizeArg(rawName, 500);
  if (!subject_name) {
    return NextResponse.json(
      { error: "subject_name contained no valid characters" },
      { status: 400 }
    );
  }

  const case_id = subjectToSlug(subject_name);
  if (!case_id) {
    return NextResponse.json(
      { error: "Could not derive case id from subject name" },
      { status: 400 }
    );
  }

  const outputDir = getOutputDir();

  const args: string[] = [
    "-m",
    "src.main",
    "investigate",
    subject_name,
  ];
  if (body.current_role != null && String(body.current_role).trim()) {
    args.push("--role", sanitizeArg(String(body.current_role), 200));
  }
  if (body.current_org != null && String(body.current_org).trim()) {
    args.push("--org", sanitizeArg(String(body.current_org), 200));
  }
  if (
    body.max_iterations != null &&
    Number.isInteger(body.max_iterations) &&
    body.max_iterations >= 1 &&
    body.max_iterations <= 50
  ) {
    args.push("--max-iter", String(body.max_iterations));
  }
  args.push("--output", outputDir);

  const { repoRoot, pythonPath } = getRepoRootAndPython();

  // Don't pass LLM/search API keys from Node env so the backend uses only repo .env
  const keysToOmit = new Set([
    "LITELLM_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "TAVILY_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "LANGCHAIN_API_KEY",
  ]);
  const passthroughEnv: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: "1" };
  keysToOmit.forEach((k) => delete passthroughEnv[k]);

  try {
    const child = spawn(pythonPath, args, {
      cwd: repoRoot,
      stdio: "ignore",
      detached: true,
      env: passthroughEnv,
    });
    child.unref();
  } catch (err) {
    console.error("Failed to spawn backend:", err);
    return NextResponse.json(
      {
        error: `Backend process could not be started. Ensure the Python env exists (from repo root: make install). Tried: ${pythonPath} (cwd: ${repoRoot}). Set BACKEND_PYTHON and REPO_ROOT in frontend/.env.local to override.`,
      },
      { status: 503 }
    );
  }

  try {
    const runningPath = path.join(outputDir, `${case_id}${RUNNING_FILENAME}`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      runningPath,
      JSON.stringify({
        subject_name,
        started_at: new Date().toISOString(),
      }),
      "utf-8"
    );
  } catch (e) {
    console.error("Failed to write running sentinel:", e);
  }

  const response: InvestigateResponse = {
    case_id,
    status: "running",
  };
  return NextResponse.json(response);
}
