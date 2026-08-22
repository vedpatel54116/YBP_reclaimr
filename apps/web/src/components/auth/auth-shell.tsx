"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { APP_NAME } from "@reclaimr/shared";
import { ThemeToggle } from "@reclaimr/ui";
import { getSession, hasCompletedOnboarding } from "@/lib/auth";

/**
 * Chrome for the unauthenticated area: minimal header (wordmark, theme) and a
 * centered single-column stage. Visitors with a session are routed onward —
 * finished onboarding goes to the dashboard, otherwise back to onboarding.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (getSession()) {
      router.replace(hasCompletedOnboarding() ? "/dashboard" : "/onboarding");
    } else {
      setChecked(true);
    }
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="font-heading text-lg font-bold tracking-tight uppercase focus-visible:outline-2"
          >
            {APP_NAME}
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        {checked ? (
          <div className="w-full max-w-md animate-scale-in">{children}</div>
        ) : (
          // Skeleton card while the session check resolves.
          <div
            aria-hidden="true"
            className="h-96 w-full max-w-md rounded-lg border bg-card p-5 animate-pulse"
          />
        )}
      </main>
    </div>
  );
}
