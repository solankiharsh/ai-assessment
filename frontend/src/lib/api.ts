"use strict";

import type {
  CaseSummary,
  Investigation,
  InvestigateRequest,
  InvestigateResponse,
  GraphResponse,
} from "./types";

const BASE = "";

function headersWithAuth(token: string | null | undefined): HeadersInit {
  const h: HeadersInit = {};
  if (token?.trim()) (h as Record<string, string>)["Authorization"] = `Bearer ${token.trim()}`;
  return h;
}

async function get<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: headersWithAuth(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headersWithAuth(token),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  listCases: (token?: string | null) => get<{ cases: CaseSummary[] }>("/api/cases", token),
  getCase: (id: string, token?: string | null) =>
    get<Investigation>(`/api/cases/${encodeURIComponent(id)}`, token),
  getGraph: (id: string) =>
    get<GraphResponse>(`/api/cases/${encodeURIComponent(id)}/graph`),
  investigate: (body: InvestigateRequest, token?: string | null) =>
    post<InvestigateResponse>("/api/investigate", body, token),
};
