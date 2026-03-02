"use strict";

/**
 * Runtime public config (e.g. Privy app ID). Used when NEXT_PUBLIC_* was not
 * available at build time (e.g. Docker build without build args).
 */
export async function GET() {
  const privyAppId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? "";
  return Response.json({ privyAppId });
}
