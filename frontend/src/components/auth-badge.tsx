"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";

const PRIVY_APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? "";

/**
 * Renders Sign in link or signed-in user + Sign out. When Privy is configured,
 * uses usePrivy (must be inside PrivyProvider). When not configured, shows a
 * Sign in link to /login (login page shows "not configured" message).
 */
export function AuthBadge() {
  if (!PRIVY_APP_ID) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-medium text-orange-400 transition-colors hover:bg-orange-500/20 hover:text-orange-300 sm:px-4 sm:py-1.5 sm:text-xs"
      >
        Sign in
      </Link>
    );
  }
  return <AuthBadgeInner />;
}

function AuthBadgeInner() {
  const { ready, authenticated, user, logout } = usePrivy();
  if (!ready) return null;
  if (authenticated) {
    const label =
      user?.email?.address ?? user?.wallet?.address ?? "Signed in";
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 sm:px-4 sm:py-1.5">
        <span className="max-w-[120px] truncate text-[11px] font-medium text-neutral-300 sm:max-w-[160px] sm:text-xs">
          {label}
        </span>
        <button
          type="button"
          onClick={() => logout()}
          className="text-[11px] font-medium text-neutral-500 transition-colors hover:text-orange-400 sm:text-xs"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-medium text-orange-400 transition-colors hover:bg-orange-500/20 hover:text-orange-300 sm:px-4 sm:py-1.5 sm:text-xs"
    >
      Sign in
    </Link>
  );
}
