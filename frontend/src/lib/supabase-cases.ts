"use strict";

/**
 * Persist investigation cases to Supabase Storage so they survive Railway redeploys.
 * When SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, case files are read/written
 * to the "investigation-cases" bucket; list and detail APIs merge Storage with local files.
 *
 * Storage layout:
 *   - Legacy public (root): {id}_state.json, ...
 *   - Public: public/{id}_state.json, ...
 *   - User: users/{userId}/{id}_state.json, ...
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CaseSummary } from "@/lib/types";

const BUCKET = "investigation-cases";

/** Storage path prefix for public cases (new). Legacy public at root (no prefix). */
export const PUBLIC_PREFIX = "public/";
/** Storage path prefix for user-owned cases. */
export function userPrefix(userId: string): string {
  return `users/${encodeURIComponent(userId)}/`;
}

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

/** Extract case id from object name; supports "id_state.json" and "prefix/id_state.json". */
function extractCaseId(name: string): string | null {
  const base = name.includes("/") ? name.split("/").pop() ?? name : name;
  const m = base.match(/^(.+)_(state\.json|report\.md|entities\.json|metadata\.json|progress\.jsonl|meta\.json)$/);
  return m ? m[1] : null;
}

function extractCaseIds(names: string[]): Set<string> {
  const ids = new Set<string>();
  for (const name of names) {
    const id = extractCaseId(name);
    if (id) ids.add(id);
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

/** List object keys under a prefix. prefix is e.g. "" or "public/" or "users/uid/". */
async function listUnderPrefix(
  supabase: SupabaseClient,
  prefix: string
): Promise<string[]> {
  const folder = prefix.replace(/\/$/, "") || "";
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 2000 });
  if (error || !data?.length) return [];
  return data.map((f) => (prefix ? `${prefix}${f.name}` : f.name));
}

async function listCasesUnderPrefix(
  supabase: SupabaseClient,
  prefix: string,
  scope: "public" | "mine"
): Promise<CaseSummary[]> {
  const names = await listUnderPrefix(supabase, prefix);
  const ids = extractCaseIds(names);
  const cases: CaseSummary[] = [];
  for (const id of ids) {
    const metaKey = prefix ? `${prefix}${id}_meta.json` : `${id}_meta.json`;
    const meta = await downloadJson<CaseMeta>(supabase, metaKey);
    if (meta) {
      cases.push({
        id,
        subject_name: meta.subject_name ?? id.replace(/_/g, " "),
        updated_at: meta.updated_at ?? new Date().toISOString(),
        risk_score: meta.risk_score > 0 ? meta.risk_score : undefined,
        confidence: meta.confidence > 0 ? meta.confidence : undefined,
        status: "complete",
        scope,
      });
    } else {
      const stateKey = prefix ? `${prefix}${id}_state.json` : `${id}_state.json`;
      const state = await downloadJson<{ subject?: { full_name?: string } }>(supabase, stateKey);
      if (state) {
        cases.push({
          id,
          subject_name: state.subject?.full_name ?? id.replace(/_/g, " "),
          updated_at: new Date().toISOString(),
          risk_score: undefined,
          confidence: undefined,
          status: "complete",
          scope,
        });
      }
    }
  }
  return cases;
}

/**
 * List cases from Supabase Storage. Public = root + public/ prefix; if ownerId, also list users/ownerId/.
 * Returns cases with scope "public" or "mine".
 */
export async function listCasesFromSupabase(ownerId?: string | null): Promise<CaseSummary[]> {
  const supabase = getClient();
  if (!supabase) return [];
  try {
    const [rootCases, publicCases, userCases] = await Promise.all([
      listCasesUnderPrefix(supabase, "", "public"),
      listCasesUnderPrefix(supabase, PUBLIC_PREFIX, "public"),
      ownerId ? listCasesUnderPrefix(supabase, userPrefix(ownerId), "mine") : Promise.resolve([] as CaseSummary[]),
    ]);
    const byKey = new Map<string, CaseSummary>();
    for (const c of [...rootCases, ...publicCases]) {
      byKey.set(c.id, { ...c, scope: "public" });
    }
    for (const c of userCases) {
      byKey.set(`${c.id}:mine`, { ...c, scope: "mine" });
    }
    const cases = Array.from(byKey.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    return cases;
  } catch (e) {
    console.error("Supabase listCases", e);
    return [];
  }
}

export interface GetCaseResult {
  files: CaseFiles;
  /** Set when case was found under users/{ownerId}/; null when from root or public/. */
  ownerId: string | null;
}

/**
 * Get full case by id from Supabase Storage. Tries root, then public/, then users/ownerId/.
 * Returns files and the ownerId if found under a user prefix (for re-upload).
 */
export async function getCaseFromSupabase(
  id: string,
  ownerId?: string | null
): Promise<GetCaseResult | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const prefixes: { prefix: string; ownerId: string | null }[] = [
    { prefix: "", ownerId: null },
    { prefix: PUBLIC_PREFIX, ownerId: null },
  ];
  if (ownerId) prefixes.push({ prefix: userPrefix(ownerId), ownerId });
  for (const { prefix, ownerId: foundOwner } of prefixes) {
    const base = prefix ? `${prefix}${id}` : id;
    const [state, report, entities, metadata, progress] = await Promise.all([
      downloadJson(supabase, `${base}_state.json`),
      downloadText(supabase, `${base}_report.md`),
      downloadJson(supabase, `${base}_entities.json`),
      downloadJson(supabase, `${base}_metadata.json`),
      downloadText(supabase, `${base}_progress.jsonl`),
    ]);
    if (state) {
      return {
        files: {
          state,
          report: report ?? "",
          entities: entities ?? null,
          metadata: metadata ?? null,
          progress: progress ?? "",
        },
        ownerId: foundOwner,
      };
    }
  }
  return null;
}

/**
 * Upload case files to Supabase Storage. If ownerId, upload to users/ownerId/; else to public/.
 */
export async function uploadCaseToSupabase(
  id: string,
  files: CaseFiles,
  meta: CaseMeta,
  ownerId?: string | null
): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  const prefix = ownerId ? userPrefix(ownerId) : PUBLIC_PREFIX;
  const base = prefix ? `${prefix}${id}` : id;
  try {
    const utf8 = (s: string) => new Blob([s], { type: "text/plain;charset=utf-8" });
    const jsonBlob = (obj: unknown) =>
      new Blob([JSON.stringify(obj, null, 0)], { type: "application/json" });

    await Promise.all([
      supabase.storage.from(BUCKET).upload(`${base}_state.json`, jsonBlob(files.state), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${base}_report.md`, utf8(files.report), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${base}_entities.json`, jsonBlob(files.entities), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${base}_metadata.json`, jsonBlob(files.metadata), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${base}_progress.jsonl`, utf8(files.progress), { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${base}_meta.json`, jsonBlob(meta), { upsert: true }),
    ]);
  } catch (e) {
    console.error("Supabase uploadCase", id, e);
  }
}
