"use client";

import { useState, type ReactNode } from "react";
import { Button, RefreshIcon, useToast } from "@reclaimr/ui";

/**
 * Simulates a transaction scan: the detection pipeline has no endpoint yet,
 * so the button runs a short in-flight state and reports the outcome.
 */
export function RunScanButton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function onScan() {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    setLoading(false);
    toast({
      title: "Scan complete",
      description: "Scanned 214 transactions — no new recurring charges found.",
    });
  }

  return (
    <Button variant="secondary" size={size} loading={loading} onClick={onScan}>
      {loading ? null : <RefreshIcon className="size-4" />}
      {loading ? "Scanning…" : "Scan for charges"}
    </Button>
  );
}

/** Generic client wrapper for one-shot demo actions that only need a toast. */
export function ToastAction({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => toast({ title, description })}
      className="cursor-pointer text-left"
    >
      {children}
    </button>
  );
}
