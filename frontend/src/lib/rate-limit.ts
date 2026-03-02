"use strict";

/**
 * In-memory rate limiter for investigate runs (app-key path).
 * Key by userId; allows N runs per window (e.g. per hour). Resets on deploy.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_PER_WINDOW = 10;

const store = new Map<string, number[]>();

function getMaxPerWindow(): number {
  const env = process.env.INVESTIGATE_RATE_LIMIT_PER_HOUR;
  if (env != null) {
    const n = parseInt(env, 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return DEFAULT_MAX_PER_WINDOW;
}

/**
 * Returns true if the user is over limit (should reject with 429).
 */
export function isOverLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let times = store.get(userId) ?? [];
  times = times.filter((t) => t > cutoff);
  const max = getMaxPerWindow();
  if (times.length >= max) return true;
  times.push(now);
  store.set(userId, times);
  return false;
}
