"use strict";

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { subjectToSlug } from "@/lib/utils";
import { getUserIdFromRequest } from "@/lib/auth";
import { isOverLimit } from "@/lib/rate-limit";
import type { InvestigateRequest, InvestigateResponse, UserKeys } from "@/lib/types";

const RUNNING_FILENAME = "_running.json";
const RUN_META_FILENAME = "_run_meta.json";

const USER_KEY_NAMES = [
  "LITELLM_API_KEY",
  "LITELLM_API_BASE",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "TAVILY_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "LANGCHAIN_API_KEY",
] as const;

const MAX_KEY_LENGTH = 512;
const MAX_BASE_URL_LENGTH = 512;

function hasUserKeys(userKeys?: UserKeys | null): boolean {
  if (!userKeys || typeof userKeys !== "object") return false;
  const keys: (keyof UserKeys)[] = [
    "litellm_api_key",
    "litellm_api_base",
    "anthropic_api_key",
    "openai_api_key",
    "google_api_key",
    "tavily_api_key",
    "brave_api_key",
    "langchain_api_key",
  ];
  return keys.some((k) => typeof userKeys[k] === "string" && (userKeys[k] as string).trim().length > 0);
}

function getUserKeysEnv(userKeys: UserKeys): Record<string, string> {
  const keyMap: Record<string, keyof UserKeys> = {
    LITELLM_API_KEY: "litellm_api_key",
    LITELLM_API_BASE: "litellm_api_base",
    ANTHROPIC_API_KEY: "anthropic_api_key",
    OPENAI_API_KEY: "openai_api_key",
    GOOGLE_API_KEY: "google_api_key",
    TAVILY_API_KEY: "tavily_api_key",
    BRAVE_SEARCH_API_KEY: "brave_api_key",
    LANGCHAIN_API_KEY: "langchain_api_key",
  };
  const env: Record<string, string> = {};
  for (const envName of USER_KEY_NAMES) {
    const key = keyMap[envName];
    const v = key ? userKeys[key] : undefined;
    if (typeof v !== "string" || !v.trim()) continue;
    const trimmed = v.trim();
    if (envName === "LITELLM_API_BASE") {
      env[envName] = trimmed.slice(0, MAX_BASE_URL_LENGTH);
    } else {
      env[envName] = trimmed.replace(/\s/g, "").slice(0, MAX_KEY_LENGTH);
    }
  }
  return env;
}

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

  const auth = await getUserIdFromRequest(request);
  const usingOwnKeys = hasUserKeys(body.user_keys);

  if (!usingOwnKeys) {
    if (!auth) {
      return NextResponse.json(
        { error: "Sign in required to run with app keys" },
        { status: 401 }
      );
    }
    if (isOverLimit(auth.userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429, headers: { "Retry-After": "3600" } }
      );
    }
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

  // Pass env to backend. If user provided keys, overlay them (never stored or logged).
  const passthroughEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    ...(usingOwnKeys && body.user_keys ? getUserKeysEnv(body.user_keys) : {}),
  };

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
    fs.mkdirSync(outputDir, { recursive: true });
    const runningPath = path.join(outputDir, `${case_id}${RUNNING_FILENAME}`);
    fs.writeFileSync(
      runningPath,
      JSON.stringify({
        subject_name,
        started_at: new Date().toISOString(),
      }),
      "utf-8"
    );
    const runMetaPath = path.join(outputDir, `${case_id}${RUN_META_FILENAME}`);
    fs.writeFileSync(
      runMetaPath,
      JSON.stringify({ owner_id: auth?.userId ?? null }),
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
