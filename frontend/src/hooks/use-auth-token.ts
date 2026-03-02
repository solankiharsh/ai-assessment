"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Returns a function that resolves to the current Privy access token (or null).
 * Use when calling API methods that support optional auth (listCases, getCase, investigate with app keys).
 */
export function useAuthToken(): () => Promise<string | null> {
  const { getAccessToken, authenticated } = usePrivy();
  return useCallback(async () => {
    if (!authenticated || typeof getAccessToken !== "function") return null;
    try {
      const token = await getAccessToken();
      return token ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken, authenticated]);
}
