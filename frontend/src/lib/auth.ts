"use strict";

/**
 * Server-side auth: verify Privy access token and return user id for scoping cases.
 * When Privy is not configured or token is invalid, returns null.
 */

export type AuthResult = { userId: string } | null;

/**
 * Returns the authenticated user id from the request, or null.
 * Expects Authorization: Bearer <access_token> from Privy getAccessToken().
 */
export async function getUserIdFromRequest(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId?.trim() || !appSecret?.trim()) return null;

  try {
    const { PrivyClient } = await import("@privy-io/node");
    const privy = new PrivyClient({ appId: appId.trim(), appSecret: appSecret.trim() });
    const verified = await privy.utils().auth().verifyAccessToken(token);
    const userId = verified?.user_id;
    if (userId && typeof userId === "string") return { userId };
  } catch {
    // Invalid token or verification error
  }
  return null;
}
