"use client";

import { useEffect, useRef, useState } from "react";
import { Button, CheckIcon, EmptyState, ProgressBar, Spinner } from "@reclaimr/ui";
import { detectCharges, type DetectedCharge } from "@/lib/onboarding";

/** Simulated total so the counter feels like real work being done. */
const TOTAL_TRANSACTIONS = 1284;
const TICK_MS = 80;
const PROGRESS_PER_TICK = 1.4;
const COMPLETE_HOLD_MS = 900;

const STAGES = [
  { label: "Connecting to your banks", through: 20 },
  { label: "Fetching 12 months of transactions", through: 55 },
  { label: "Detecting recurring charges", through: 85 },
  { label: "Building your findings report", through: 100 },
] as const;

export function SyncStep({
  linkedAccountIds,
  onComplete,
  onBackToLink,
}: {
  linkedAccountIds: string[];
  /** Called with the scan results once the run finishes. */
  onComplete: (detections: DetectedCharge[]) => void;
  onBackToLink: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No "started" guard: under StrictMode's dev double-mount the cleanup clears
  // the first interval, so the second mount must be allowed to start its own.
  useEffect(() => {
    if (linkedAccountIds.length === 0) return;

    const interval = setInterval(() => {
      setProgress((current) => {
        const next = Math.min(100, current + PROGRESS_PER_TICK);
        if (next >= 100) clearInterval(interval);
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [linkedAccountIds.length]);

  // Auto-advance shortly after the bar fills.
  useEffect(() => {
    if (progress < 100) return;
    completeTimerRef.current = setTimeout(
      () => onComplete(detectCharges(linkedAccountIds)),
      COMPLETE_HOLD_MS,
    );
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
    // onComplete identity is stable (setState wrapper); detections derive here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  if (linkedAccountIds.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance">
          Nothing to scan yet.
        </h1>
        <EmptyState
          title="No accounts connected"
          description="Link a bank account and we'll scan a year of transactions for recurring charges."
          action={
            <Button variant="secondary" onClick={onBackToLink}>
              Back to accounts
            </Button>
          }
        />
      </div>
    );
  }

  const activeStageIndex = STAGES.findIndex((stage) => Math.round(progress) <= stage.through);
  const scanned = Math.round((progress / 100) * TOTAL_TRANSACTIONS);

  return (
    <div className="flex flex-col gap-8" aria-busy={progress < 100}>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {progress < 100 ? "Scanning" : "Scan complete"}
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance">
          {progress < 100 ? "Reading your history…" : "Done reading."}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {scanned.toLocaleString("en-US")} of {TOTAL_TRANSACTIONS.toLocaleString("en-US")}{" "}
          transactions scanned
        </p>
      </div>

      <ProgressBar value={progress} aria-label="Scan progress" />

      <ol className="flex flex-col divide-y rounded-lg border">
        {STAGES.map((stage, index) => {
          const done = Math.round(progress) > stage.through || progress >= 100;
          const active = !done && index === activeStageIndex;
          return (
            <li key={stage.label} className="flex items-center gap-3 p-4">
              <span className="flex size-6 shrink-0 items-center justify-center">
                {done ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-foreground">
                    <CheckIcon className="size-3.5 text-background" />
                  </span>
                ) : active ? (
                  <Spinner className="size-5" />
                ) : (
                  <span className="size-2.5 rounded-full border border-muted-foreground" />
                )}
              </span>
              <span
                className={done || active ? "text-sm font-medium" : "text-sm text-muted-foreground"}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>

      <Button
        size="lg"
        fullWidth
        disabled={progress < 100}
        onClick={() => onComplete(detectCharges(linkedAccountIds))}
      >
        {progress < 100 ? "Scanning…" : "View your findings"}
      </Button>
    </div>
  );
}
