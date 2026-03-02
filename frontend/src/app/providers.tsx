"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { PublicConfigProvider, usePublicConfig } from "@/contexts/public-config";

function AppProvidersInner({ children }: { children: React.ReactNode }) {
  const { privyAppId } = usePublicConfig();
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
  return (
    <PublicConfigProvider>
      <AppProvidersInner>{children}</AppProvidersInner>
    </PublicConfigProvider>
  );
}
