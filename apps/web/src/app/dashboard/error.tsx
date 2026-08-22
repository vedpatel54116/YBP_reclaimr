"use client";

import { useEffect } from "react";
import { AlertIcon, Button } from "@reclaimr/ui";

/**
 * Route-segment error boundary for everything under /dashboard. Rendered when
 * a server component throws (API hard failure, bad payload, ...).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-lg border border-dashed px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed text-muted-foreground">
        <AlertIcon className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          Something broke on our side
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          The dashboard failed to load. This is usually transient — retry, and if it persists check
          that the API is running.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-subtle-foreground">ref {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
