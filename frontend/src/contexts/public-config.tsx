"use client";

import { createContext, useContext, useEffect, useState } from "react";

type PublicConfig = { privyAppId: string; isLoading: boolean };

const PublicConfigContext = createContext<PublicConfig>({
  privyAppId: "",
  isLoading: true,
});

const BUILD_TIME_APP_ID =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? "")
    : "";

export function PublicConfigProvider({ children }: { children: React.ReactNode }) {
  const [fetched, setFetched] = useState<string | null>(null);
  const [loading, setLoading] = useState(!BUILD_TIME_APP_ID);

  useEffect(() => {
    if (BUILD_TIME_APP_ID) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/public-config")
      .then((r) => r.json())
      .then((data: { privyAppId?: string }) => {
        if (!cancelled && typeof data.privyAppId === "string") {
          setFetched(data.privyAppId);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const privyAppId = BUILD_TIME_APP_ID || fetched || "";
  const value: PublicConfig = {
    privyAppId,
    isLoading: loading,
  };

  return (
    <PublicConfigContext.Provider value={value}>
      {children}
    </PublicConfigContext.Provider>
  );
}

export function usePublicConfig(): PublicConfig {
  return useContext(PublicConfigContext);
}

/** Effective Privy app ID (build-time or runtime from /api/public-config). */
export function usePrivyAppId(): string {
  const { privyAppId } = usePublicConfig();
  return privyAppId;
}
