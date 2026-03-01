"use strict";

/**
 * Persist investigation cases to Supabase Storage so they survive Railway redeploys.
 * When SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, case files are read/written
 * to the "investigation-cases" bucket; list and detail APIs merge Storage with local files.
 *
 * Storage layout (same as local output dir):
 *   {id}_state.json, {id}_report.md, {id}_entities.json, {id}_metadata.json,
 *   {id}_progress.jsonl, {id}_meta.json (summary for listing)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CaseSummary } from "@/lib/types";

const BUCKET = "investigation-cases";

export interface CaseFiles {
  state: unknown;
  report: string;
  entities: unknown;
  metadata: unknown;
  progress: string;
}

/** Summary stored as {id}_meta.json for cheap listing. */
export interface CaseMeta {
  subject_name: string;
  risk_score: number;
  confidence: number;
  updated_at: string;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    return client;
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getClient() != null;
}

function extractCaseIds(names: string[]): Set<string> {
  const ids = new Set<string>();
  for (const name of names) {
    const m = name.match(/^(.+)_(state\.json|report\.md|entities\.json|metadata\.json|progress\.jsonl|meta\.json)$/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

async function downloadText(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return await data.text();
}

async function downloadJson<T>(supabase: SupabaseClient, key: string): Promise<T | null> {
  const text = await downloadText(supabase, key);
  if (text == null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * List cases from Supabase Storage. Uses {id}_meta.json when present for summary.
 */
export async function listCasesFromSupabase(): Promise<CaseSummary[]> {
  const supabase = getClient();
  if (!supabase) return [];
  try {
    const { data: listData, error: listError } = await supabase.storage.from(BUCKET).list("", { limit: 2000 });
    if (listError || !listData?.length) return [];
    const names = listData.map((f) => f.name);
    const ids = extractCaseIds(names);
    const cases: CaseSummary[] = [];
    for (const id of ids) {
      const meta = await downloadJson<CaseMeta>(supabase, `${id}_meta.json`);
      if (meta) {
        cases.push({
          id,
          subject_name: meta.subject_name ?? id.replace(/_/g, " "),
          updated_at: meta.updated_at ?? new Date().toISOString(),
          risk_score: meta.risk_score > 0 ? meta.risk_score : undefined,
          confidence: meta.confidence > 0 ? meta.confidence : undefined,
          status: "complete",
        });
      } else {
        const state = await downloadJson<{ subject?: { full_name?: string } }>(supabase, `${id}_state.json`);
        if (state) {
          cases.push({
            id,
            subject_name: state.subject?.full_name ?? id.replace(/_/g, " "),
            updated_at: new Date().toISOString(),
            risk_score: undefined,
            confidence: undefined,
            status: "complete",
          });
        }
      }
    }
    cases.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return cases;
  } catch (e) {
    console.error("Supabase listCases", e);
    return [];
  }
}

/**
 * Get full case by id from Supabase Storage (state, report, entities, metadata, progress).
 */
export async function getCaseFromSupabase(id: string): Promise<CaseFiles | null> {
  const supabase = getClient();
  if (!supabase) return null;
  try {
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
  } catch {
    return null;
  }
}

/**
 * Upload case files to Supabase Storage so they persist across deploys.
 * Also uploads {id}_meta.json for cheap listing.
 */
export async function uploadCaseToSupabase(
  id: string,
  files: CaseFiles,
  meta: CaseMeta
): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  try {
    const utf8 = (s: string) => new Blob([s], { type: "text/plain;charset=utf-8" });
    const jsonBlob = (obj: unknown) =>
      new Blob([JSON.stringify(obj, null, 0)], { type: "application/json" });

    await Promise.all([
      supabase.storage.from(BUCKET).upload(`${id}_state.json`, jsonBlob(files.state), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${id}_report.md`, utf8(files.report), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${id}_entities.json`, jsonBlob(files.entities), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${id}_metadata.json`, jsonBlob(files.metadata), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${id}_progress.jsonl`, utf8(files.progress), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${id}_meta.json`, jsonBlob(meta), { upsert: true }),
    ]);
  } catch (e) {
    console.error("Supabase uploadCase", id, e);
  }
}
