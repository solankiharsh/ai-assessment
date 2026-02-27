"use strict";

import path from "path";
import fs from "fs";

/** Resolve backend output directory: env OUTPUT_DIR or repo root outputs/ relative to cwd (frontend). */
export function getOutputDir(): string {
  const env = process.env.OUTPUT_DIR;
  if (env) return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  return path.resolve(process.cwd(), "..", "outputs");
}

export function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export function listStateFiles(outputDir: string): string[] {
  try {
    const names = fs.readdirSync(outputDir);
    const fromState = names
      .filter((n) => n.endsWith("_state.json"))
      .map((n) => n.replace(/_state\.json$/, ""));
    const fromRunning = names
      .filter((n) => n.endsWith("_running.json"))
      .map((n) => n.replace(/_running\.json$/, ""));
    const combined = new Set([...fromState, ...fromRunning]);
    return Array.from(combined);
  } catch {
    return [];
  }
}

export function getMtime(filePath: string): Date | null {
  try {
    const s = fs.statSync(filePath);
    return s.mtime;
  } catch {
    return null;
  }
}
