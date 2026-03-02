"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePublicConfig } from "@/contexts/public-config";

export default function LoginPage() {
  const { privyAppId, isLoading } = usePublicConfig();
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" />
        <p className="mt-4 text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }
  if (!privyAppId) {
    return <LoginUnconfigured />;
  }
  return <LoginWithPrivy />;
}

function LoginUnconfigured() {
  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-orange-500/[0.04] blur-[100px]" />
      </div>
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Sign-in not configured
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Set <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_PRIVY_APP_ID</code> and <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">PRIVY_APP_SECRET</code> in your environment to enable login.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-orange-400 hover:text-orange-300"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoginWithPrivy() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.replace("/");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-orange-500/[0.04] blur-[100px]" />
        </div>
        <div className="relative flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" />
          <p className="text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-orange-500/[0.04] blur-[100px]" />
        <div className="absolute right-0 top-1/3 h-[300px] w-[400px] rounded-full bg-orange-600/[0.03] blur-[80px]" />
      </div>

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              AI-Powered <span className="text-orange-500">Due Diligence</span>
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Sign in to run investigations and view reports.
            </p>
          </div>

          <button
            onClick={login}
            className="w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
          >
            Sign in
          </button>

          <p className="mt-6 text-center text-[11px] text-neutral-500">
            By signing in you agree to our terms. Your session is used only to
            access this research tool.
          </p>
        </div>

        <Link
          href="/"
          className="mt-8 text-sm text-neutral-500 transition-colors hover:text-orange-400"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
