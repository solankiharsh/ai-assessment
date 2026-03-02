"use strict";

/**
 * Push temporal data from a local state file into the case stored in Supabase.
 * Run from your machine (where the merged state file exists) with production
 * Supabase credentials to fix "Timeline not available" on the deployed app.
 *
 * Usage (from repo root or frontend):
 *   cd frontend && node scripts/push-temporal-to-supabase.mjs <case_id>
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. from frontend/.env.local
 * or export for production bucket).
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const candidates = [
    path.join(__dirname, "..", ".env.local"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "frontend", ".env.local"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split("\n")) {
          const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
          if (m && !process.env[m[1]]) {
            const val = m[2].replace(/^["']|["']$/g, "").trim();
            process.env[m[1]] = val;
          }
        }
        return;
      }
    } catch {
      // ignore
    }
  }
}

const BUCKET = "investigation-cases";

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getCandidateDirs() {
  const cwd = process.cwd();
  return [
    path.join(cwd, "outputs_captured"),
    path.join(cwd, "outputs"),
    path.join(cwd, "..", "outputs_captured"),
    path.join(cwd, "..", "outputs"),
  ];
}

async function downloadText(supabase, key) {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return await data.text();
}

async function downloadJson(supabase, key) {
  const text = await downloadText(supabase, key);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getCaseFromSupabase(supabase, id) {
  const [state, report, entities, metadata, progress] = await Promise.all([
    downloadJson(supabase, `${id}_state.json`),
    downloadText(supabase, `${id}_report.md`),
    downloadJson(supabase, `${id}_entities.json`),
    downloadJson(supabase, `${id}_metadata.json`),
    downloadText(supabase, `${id}_progress.jsonl`),
  ]);
  if (!state) return null;
  return {
    state,
    report: report ?? "",
    entities: entities ?? null,
    metadata: metadata ?? null,
    progress: progress ?? "",
  };
}

async function uploadCaseToSupabase(supabase, id, files, meta) {
  const utf8 = (s) => new Blob([s], { type: "text/plain;charset=utf-8" });
  const jsonBlob = (obj) =>
    new Blob([JSON.stringify(obj, null, 0)], { type: "application/json" });
  await Promise.all([
    supabase.storage.from(BUCKET).upload(`${id}_state.json`, jsonBlob(files.state), { upsert: true }),
    supabase.storage.from(BUCKET).upload(`${id}_report.md`, utf8(files.report), { upsert: true }),
    supabase.storage.from(BUCKET).upload(`${id}_entities.json`, jsonBlob(files.entities), { upsert: true }),
    supabase.storage.from(BUCKET).upload(`${id}_metadata.json`, jsonBlob(files.metadata), { upsert: true }),
    supabase.storage.from(BUCKET).upload(`${id}_progress.jsonl`, utf8(files.progress), { upsert: true }),
    supabase.storage.from(BUCKET).upload(`${id}_meta.json`, jsonBlob(meta), { upsert: true }),
  ]);
}

async function main() {
  const id = process.argv[2];
  if (!id || id.includes("..") || /[^a-z0-9_]/i.test(id)) {
    console.error("Usage: node scripts/push-temporal-to-supabase.mjs <case_id>");
    process.exit(1);
  }

  loadEnvLocal();
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in frontend/.env.local or export).");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const stored = await getCaseFromSupabase(supabase, id);
  if (!stored) {
    console.error("Case not found in Supabase:", id);
    process.exit(1);
  }

  const state = stored.state;
  const existingFacts = state.temporal_facts ?? [];
  const existingContradictions = state.temporal_contradictions ?? [];
  if (existingFacts.length > 0 || existingContradictions.length > 0) {
    console.log("Temporal data already present in Supabase:", existingFacts.length, "facts,", existingContradictions.length, "contradictions");
    process.exit(0);
  }

  const dirs = getCandidateDirs();
  let sourceState = null;
  let usedPath = null;
  for (const dir of dirs) {
    const p = path.join(dir, `${id}_state.json`);
    const loaded = readJson(p);
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
    console.error(
      "No local state file with temporal data found. Put a state JSON at outputs_captured/%s_state.json or outputs/%s_state.json, or run: python scripts/merge_temporal_into_state.py --state outputs/%s_state.json",
      id,
      id,
      id
    );
    process.exit(1);
  }

  const facts = sourceState.temporal_facts ?? [];
  const contradictions = sourceState.temporal_contradictions ?? [];
  const mergedState = { ...state, temporal_facts: facts, temporal_contradictions: contradictions };

  const subject = state.subject;
  const meta = {
    subject_name: subject?.full_name ?? id.replace(/_/g, " "),
    risk_score: typeof state.risk_score === "number" ? state.risk_score : 0,
    confidence: typeof state.overall_confidence === "number" ? state.overall_confidence : 0,
    updated_at: new Date().toISOString(),
  };

  await uploadCaseToSupabase(supabase, id, {
    state: mergedState,
    report: stored.report,
    entities: stored.entities,
    metadata: stored.metadata,
    progress: stored.progress,
  }, meta);

  console.log("OK: Temporal data pushed to Supabase from", usedPath);
  console.log("  temporal_facts:", facts.length, "temporal_contradictions:", contradictions.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
