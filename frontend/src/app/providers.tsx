"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

/** Client must use NEXT_PUBLIC_PRIVY_APP_ID; optional fallback for build-time only */
const privyAppId =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? "";

function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      })
  );
  const content = (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  if (!privyAppId) {
    return content;
  }
  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#ea580c",
          landingHeader: "Sign in to Due Diligence Research",
          loginMessage: "Sign in to run investigations and view reports.",
        },
      }}
    >
      {content}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
