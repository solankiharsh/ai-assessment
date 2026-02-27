"use strict";

import type {
  CaseSummary,
  Investigation,
  InvestigateRequest,
  InvestigateResponse,
  GraphResponse,
} from "./types";

const BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  listCases: () => get<{ cases: CaseSummary[] }>("/api/cases"),
  getCase: (id: string) => get<Investigation>(`/api/cases/${encodeURIComponent(id)}`),
  getGraph: (id: string) =>
    get<GraphResponse>(`/api/cases/${encodeURIComponent(id)}/graph`),
  investigate: (body: InvestigateRequest) =>
    post<InvestigateResponse>("/api/investigate", body),
};
